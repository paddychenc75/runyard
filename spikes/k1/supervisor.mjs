// 最小的管理进程（runyardd 的替身）。纯 Node：不导入 electron，不含原生模块。
// 它既能用系统的 node 运行，也能用 Electron 可执行文件加 ELECTRON_RUN_AS_NODE=1 运行。
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { endpointOf, loadConfig, PRODUCT_VERSION, pathsOf } from "./lib/config.mjs";
import { acquireAndListen } from "./lib/instance-lock.mjs";
import { clientProof, decodeNonce, newNonce, readFrames, sameBytes, send, serverProof } from "./lib/wire.mjs";

const cfg = loadConfig();
const p = pathsOf(cfg);
const endpoint = endpointOf(cfg);
const instanceId = crypto.randomUUID();
const token = crypto.randomBytes(32);
const bootAt = Date.now();

// 先收紧 umask：socket 文件和发现文件从创建的那一刻起就只有本人可访问，不留“先建后改权限”的空档
if (process.platform !== "win32") process.umask(0o077);
fs.mkdirSync(p.runDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(p.logDir, { recursive: true, mode: 0o700 });
if (process.platform !== "win32") fs.chmodSync(p.runDir, 0o700);

const appendLine = (file, obj) => fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
const log = (event, data = {}) => appendLine(p.eventLog, { at: Date.now(), pid: process.pid, event, ...data });
const noteStart = (phase, data = {}) => appendLine(p.startsLog, { at: Date.now(), pid: process.pid, phase, ...data });

noteStart("boot", { launcher: cfg.launcher });

const conns = new Set();
const runs = new Map();
const graceTimers = new Map(); // clientId → 计时器：应用的连接断了以后留给重连的时间
let idleTimer = null;
let shuttingDown = false;
let nextRun = 1;

const server = net.createServer(onConnection);

// ---------- 运行 ----------

function waitPort(port, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve(false);
      const s = net.connect({ host: "127.0.0.1", port });
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => {
        s.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(attempt, 40);
      });
    };
    attempt();
  });
}

async function startRun({ argv, cwd, port, owner }) {
  const runId = `r${nextRun++}`;
  const env = { ...process.env };
  // 管理进程自己可能是“当作 Node 运行的 Electron”，这个变量不能漏给用户的程序
  delete env.ELECTRON_RUN_AS_NODE;
  const out = fs.openSync(path.join(p.logDir, `run-${runId}.log`), "a");
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    env,
    stdio: ["ignore", out, out],
    detached: process.platform !== "win32", // POSIX：自己一个进程组，停止时整组发信号
    windowsHide: true, // Windows：管理进程没有控制台，不加这项每个子进程都会自己弹一个黑窗口
  });
  fs.closeSync(out);
  child.on("error", () => {});
  if (!child.pid) throw Object.assign(new Error(`cannot spawn ${argv[0]}`), { code: "RUN_SPAWN_FAILED" });
  const run = { runId, owner, port, pid: child.pid, child, state: "starting", startedAt: Date.now() };
  run.exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      run.state = "exited";
      runs.delete(runId);
      log("run-exit", { runId, runPid: run.pid, code, signal });
      refreshIdle();
      resolve();
    });
    child.once("error", (err) => {
      log("run-spawn-error", { runId, message: err.message });
      runs.delete(runId);
      resolve();
    });
  });
  runs.set(runId, run);
  refreshIdle();
  log("run-spawned", { runId, runPid: child.pid, port, owner });
  const ready = await waitPort(port, child, 60_000);
  if (!ready) {
    await stopRun(run, "not-ready");
    throw Object.assign(new Error("run did not become ready"), { code: "READY_TIMEOUT" });
  }
  run.state = "ready";
  log("run-ready", { runId, runPid: child.pid, ms: Date.now() - run.startedAt });
  return { runId, pid: child.pid, port, owner };
}

function stopRun(run, reason) {
  if (run.stopping) return run.exited;
  run.stopping = true;
  log("run-stop-begin", { runId: run.runId, runPid: run.pid, reason });
  if (process.platform === "win32") {
    // Windows 上没有进程组信号，整棵树强制结束（优雅停止是 K2 的题目）
    spawn("taskkill", ["/PID", String(run.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    const signalGroup = (sig) => {
      try {
        process.kill(-run.pid, sig);
      } catch {
        // 进程组已经不在了
      }
    };
    signalGroup("SIGTERM");
    const hard = setTimeout(() => signalGroup("SIGKILL"), 3_000);
    run.exited.then(() => clearTimeout(hard));
  }
  return run.exited;
}

const tabRunsOf = (clientId) => [...runs.values()].filter((r) => r.owner.kind === "tab" && r.owner.clientId === clientId);

async function stopTabRuns(clientId, reason) {
  const owned = tabRunsOf(clientId);
  const began = Date.now();
  await Promise.all(owned.map((r) => stopRun(r, reason)));
  log("tab-runs-stopped", { clientId, reason, count: owned.length, ms: Date.now() - began });
  return owned.length;
}

// ---------- 连接 ----------

function onConnection(socket) {
  const conn = { socket, authed: false, client: null, saidBye: false };
  const nonce = newNonce();
  conns.add(conn);
  refreshIdle();
  socket.on("error", () => {});
  socket.on("close", () => onClose(conn));
  const helloTimer = setTimeout(() => socket.destroy(), 3_000);
  // 握手用的两条消息的形状永远不变：版本不同的两边也要靠它认出对方的版本
  send(socket, {
    t: "challenge",
    nonce: nonce.toString("base64"),
    protocol: cfg.protocol,
    minClientProtocol: cfg.minClientProtocol,
    product: PRODUCT_VERSION,
  });
  readFrames(
    socket,
    (frame) => {
      if (!conn.authed) {
        clearTimeout(helloTimer);
        return onHello(conn, nonce, frame);
      }
      onRequest(conn, frame);
    },
    () => socket.destroy(),
  );
}

function onHello(conn, nonce, frame) {
  const mode = frame.hs === "spec" ? "spec" : "v1";
  const clientNonce = frame.t === "hello" ? decodeNonce(mode, frame.clientNonce) : null;
  const proof = typeof frame.proof === "string" ? Buffer.from(frame.proof, "base64") : null;
  if (!clientNonce || !proof || !sameBytes(proof, clientProof(mode, token, nonce, clientNonce))) {
    log("handshake-rejected", { mode });
    return conn.socket.destroy();
  }
  conn.authed = true;
  conn.client = {
    kind: frame.client?.kind === "app" ? "app" : "cli",
    clientId: String(frame.client?.clientId ?? ""),
    protocol: Number(frame.client?.protocol ?? 0),
  };
  if (conn.client.kind === "app" && graceTimers.has(conn.client.clientId)) {
    clearTimeout(graceTimers.get(conn.client.clientId));
    graceTimers.delete(conn.client.clientId);
    log("app-reconnected", { clientId: conn.client.clientId });
  }
  log("client-connected", conn.client);
  send(conn.socket, {
    t: "welcome",
    proof: serverProof(mode, token, nonce, clientNonce).toString("base64"),
    pid: process.pid,
    instanceId,
    protocol: cfg.protocol,
    minClientProtocol: cfg.minClientProtocol,
    product: PRODUCT_VERSION,
    launcher: cfg.launcher,
    runs: runs.size,
  });
}

function onClose(conn) {
  conns.delete(conn);
  refreshIdle();
  if (!conn.authed) return;
  log("client-disconnected", { ...conn.client, saidBye: conn.saidBye });
  if (conn.client.kind !== "app" || conn.saidBye) return;
  const { clientId } = conn.client;
  const stillThere = [...conns].some((c) => c.authed && c.client.clientId === clientId);
  if (stillThere || tabRunsOf(clientId).length === 0 || graceTimers.has(clientId)) return;
  // 应用没有道别就断开：当作崩溃或被强杀。等一段时间留给重连，然后停掉它的标签页持有的运行（§2.4）
  log("app-connection-lost", { clientId, graceMs: cfg.graceMs });
  graceTimers.set(
    clientId,
    setTimeout(() => {
      graceTimers.delete(clientId);
      stopTabRuns(clientId, "grace-expired");
    }, cfg.graceMs),
  );
}

const READ_ONLY = new Set(["ping", "supervisor.info", "run.list", "supervisor.shutdown"]);

const methods = {
  ping: () => ({ at: Date.now() }),
  "supervisor.info": () => ({
    pid: process.pid,
    instanceId,
    launcher: cfg.launcher,
    execPath: process.execPath,
    versions: { node: process.versions.node, electron: process.versions.electron ?? null },
    protocol: cfg.protocol,
    rss: process.memoryUsage().rss,
    uptimeMs: Date.now() - bootAt,
    connections: conns.size,
    runs: runs.size,
  }),
  "run.list": () => [...runs.values()].map(({ runId, owner, port, pid, state }) => ({ runId, owner, port, pid, state })),
  "run.start": (params, conn) => {
    const owner = params.owner?.kind === "tab" ? { kind: "tab", clientId: conn.client.clientId, tabId: String(params.owner.tabId) } : { kind: "cli", command: "run" };
    return startRun({ argv: params.argv, cwd: params.cwd, port: params.port, owner });
  },
  "run.stop": async (params) => {
    const run = runs.get(params.runId);
    if (run) await stopRun(run, "requested");
    return { stopped: Boolean(run) };
  },
  "run.stopAll": async () => {
    const all = [...runs.values()];
    await Promise.all(all.map((r) => stopRun(r, "stop-all")));
    return { stopped: all.length };
  },
  // 应用正常退出时先道别：它的标签页持有的运行全部停止，最多等 5 秒（§2.4）
  "session.bye": async (_params, conn) => {
    conn.saidBye = true;
    const cap = new Promise((resolve) => setTimeout(() => resolve(-1), 5_000));
    return { stopped: await Promise.race([stopTabRuns(conn.client.clientId, "session-bye"), cap]) };
  },
  "supervisor.shutdown": (params) => {
    if (params?.ifIdle && runs.size > 0) throw Object.assign(new Error("has runs"), { code: "SUPERVISOR_BUSY", params: { runs: runs.size } });
    setImmediate(() => shutdown(`requested:${params?.reason ?? ""}`));
    return { closing: true };
  },
};

async function onRequest(conn, frame) {
  if (frame.t !== "req" || typeof frame.method !== "string") return conn.socket.destroy();
  const fail = (code, params = {}, debug = "") => send(conn.socket, { t: "res", id: frame.id, ok: false, error: { code, params, debug } });
  const handler = methods[frame.method];
  if (!handler) return fail("UNKNOWN_METHOD", { method: frame.method });
  // 协议版本低于要求的客户端只许查看和要求关闭，不许发别的请求（§5.4 握手表最后一行）
  if (conn.client.protocol < cfg.minClientProtocol && !READ_ONLY.has(frame.method)) {
    return fail("CLIENT_OUTDATED", { required: cfg.minClientProtocol, found: conn.client.protocol });
  }
  try {
    send(conn.socket, { t: "res", id: frame.id, ok: true, result: await handler(frame.params ?? {}, conn) });
  } catch (err) {
    fail(err.code ?? "INTERNAL", err.params ?? {}, String(err.message));
  }
}

// ---------- 生命周期 ----------

function refreshIdle() {
  const idle = conns.size === 0 && runs.size === 0;
  if (!idle && idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  } else if (idle && !idleTimer && !shuttingDown) {
    idleTimer = setTimeout(() => shutdown("idle"), cfg.idleExitMs);
  }
}

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutdown-begin", { reason, runs: runs.size });
  await Promise.all([...runs.values()].map((r) => stopRun(r, "shutdown")));
  // 只删自己写的发现文件：别的实例可能已经接手
  try {
    if (JSON.parse(fs.readFileSync(p.discovery, "utf8")).instanceId === instanceId) fs.rmSync(p.discovery, { force: true });
  } catch {
    // 文件不在或读不出来，都不用管
  }
  if (process.platform !== "win32") fs.rmSync(endpoint, { force: true });
  log("shutdown-done", { reason });
  process.exit(0);
}

function writeDiscovery() {
  const tmp = `${p.discovery}.${process.pid}.tmp`;
  const body = {
    formatVersion: 1,
    pid: process.pid,
    instanceId,
    endpoint,
    token: token.toString("base64"),
    protocol: cfg.protocol,
    productVersion: PRODUCT_VERSION,
    launcher: cfg.launcher,
    execPath: process.execPath,
    startedAt: bootAt,
  };
  // 先写临时文件再改名（§4.2），读的人看不到写了一半的内容
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p.discovery);
}

process.on("uncaughtException", (err) => {
  log("uncaught", { message: err.message, stack: err.stack });
  process.exit(1);
});
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
// 启动它的终端关掉时会收到 SIGHUP；管理进程已经脱钩，忽略它
process.on("SIGHUP", () => log("sighup-ignored"));

const got = await acquireAndListen(cfg, server);
if (!got.ok) {
  noteStart("lost", { reason: got.reason });
  process.exit(3); // 已经有一个了（或者连接点被别人占着），这不是错误，启动者接着去连就行
}
writeDiscovery();
noteStart("listening", { instanceId, how: got.how, bootMs: Date.now() - bootAt });
log("listening", { endpoint, how: got.how, launcher: cfg.launcher, execPath: process.execPath });
refreshIdle();
if (cfg.maxLifetimeMs > 0) setTimeout(() => shutdown("max-lifetime"), cfg.maxLifetimeMs);
