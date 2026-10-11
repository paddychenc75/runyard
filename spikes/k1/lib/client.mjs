// 客户端：应用和命令行共用。连接、握手、连不上就启动管理进程、按 §5.4 的握手表处理版本。
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { endpointOf, PRODUCT_VERSION, pathsOf, supervisorArgs } from "./config.mjs";
import { clientProof, decodeNonce, newNonce, readFrames, sameBytes, send, serverProof } from "./wire.mjs";

const SUPERVISOR_ENTRY = fileURLToPath(new URL("../supervisor.mjs", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ClientError extends Error {
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.code = code;
    this.detail = detail;
  }
}

export function readDiscovery(cfg) {
  try {
    return JSON.parse(fs.readFileSync(pathsOf(cfg).discovery, "utf8"));
  } catch {
    return null;
  }
}

// 连一次并握手。结果三选一：
//   { conn }                      握手成功，对方确实知道口令
//   { absent: true }              连接点上没有人（可以去启动）
//   { impostor: 原因 }            连接点上有人，但没能证明自己是管理进程
// 口令只用来算摘要，任何情况下都不写到连接上。
export function connectOnce(cfg, identity, timeoutMs = 2_000) {
  const discovery = readDiscovery(cfg);
  return new Promise((resolve) => {
    const socket = net.connect(endpointOf(cfg));
    let stage = "connecting";
    let nonce = null;
    let challenge = null;
    const clientNonce = newNonce();
    const pending = new Map();
    let nextId = 1;
    const finish = (result) => {
      clearTimeout(timer);
      if (!result.conn) socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish(stage === "connecting" ? { absent: true, why: "connect-timeout" } : { impostor: `timeout-at-${stage}` }), timeoutMs);
    socket.on("error", (err) => {
      if (stage === "connecting") finish({ absent: true, why: err.code });
      else if (stage !== "ready") finish({ impostor: `error-at-${stage}:${err.code}` });
    });
    socket.on("close", () => {
      if (stage !== "ready") finish({ impostor: `closed-at-${stage}` });
      for (const { reject } of pending.values()) reject(new ClientError("SUPERVISOR_UNAVAILABLE", "connection closed"));
      pending.clear();
    });
    socket.on("connect", () => {
      stage = "await-challenge";
    });
    const onFrame = (frame) => {
      if (stage === "await-challenge") {
        nonce = frame.t === "challenge" ? decodeNonce(cfg.handshake, frame.nonce) : null;
        if (!nonce) return finish({ impostor: "bad-challenge" });
        // 没有发现文件就没有口令：对面再像也无法验证，不继续
        if (!discovery?.token) return finish({ impostor: "no-token-to-verify" });
        challenge = frame;
        stage = "await-welcome";
        return send(socket, {
          t: "hello",
          hs: cfg.handshake,
          clientNonce: clientNonce.toString("base64"),
          proof: clientProof(cfg.handshake, Buffer.from(discovery.token, "base64"), nonce, clientNonce).toString("base64"),
          client: { ...identity, protocol: cfg.protocol, minServerProtocol: cfg.minServerProtocol, product: PRODUCT_VERSION },
        });
      }
      if (stage === "await-welcome") {
        const proof = frame.t === "welcome" && typeof frame.proof === "string" ? Buffer.from(frame.proof, "base64") : null;
        const expected = serverProof(cfg.handshake, Buffer.from(discovery.token, "base64"), nonce, clientNonce);
        if (!proof || !sameBytes(proof, expected)) return finish({ impostor: "bad-server-proof" });
        stage = "ready";
        return finish({ conn: makeConn(socket, pending, () => nextId++, frame, challenge) });
      }
      if (frame.t === "res" && pending.has(frame.id)) {
        const { resolve: ok, reject } = pending.get(frame.id);
        pending.delete(frame.id);
        if (frame.ok) ok(frame.result);
        else reject(new ClientError(frame.error.code, JSON.stringify(frame.error.params)));
      }
    };
    readFrames(socket, onFrame, () => finish({ impostor: `garbage-at-${stage}` }));
  });
}

function makeConn(socket, pending, newId, welcome) {
  return {
    welcome,
    socket,
    request(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = newId();
        pending.set(id, { resolve, reject });
        send(socket, { t: "req", id, method, params });
      });
    },
    close() {
      socket.destroy();
    },
  };
}

// 启动管理进程并与它脱钩。应用里 process.execPath 是 Electron 自己，所以加 ELECTRON_RUN_AS_NODE=1。
// opts.exec / opts.electron：让测试能从普通 Node 里用 Electron 的可执行文件来启动（量启动耗时用）。
// opts.via === 'cim'（只在 Windows）：改由 WMI 服务创建进程，进程不在调用者的 Job Object 里。
export function launchSupervisor(cfg, opts = {}) {
  const p = pathsOf(cfg);
  fs.mkdirSync(p.logDir, { recursive: true, mode: 0o700 });
  const exec = opts.exec ?? process.execPath;
  const asElectron = opts.electron ?? Boolean(process.versions.electron);
  const args = [SUPERVISOR_ENTRY, ...supervisorArgs(cfg), "--launcher", asElectron ? "electron" : "node", ...(opts.extraArgs ?? [])];
  if (opts.via === "cim") return launchViaCim(exec, args);
  const env = { ...process.env };
  if (asElectron) env.ELECTRON_RUN_AS_NODE = "1";
  else delete env.ELECTRON_RUN_AS_NODE;
  const out = fs.openSync(p.outLog, "a");
  const child = spawn(exec, args, {
    // 工作目录放在状态目录：否则管理进程会一直占着启动者当时所在的文件夹（Windows 上那个文件夹就删不掉、改不了名）
    cwd: cfg.stateDir,
    env,
    detached: true, // POSIX：新会话（setsid）；Windows：DETACHED_PROCESS 加新进程组，没有控制台
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  fs.closeSync(out);
  child.on("error", () => {});
  child.unref();
  return { pid: child.pid, at: Date.now() };
}

function launchViaCim(exec, args) {
  // 命令行里的每一项都加双引号；路径里不会有双引号。CreateFlags 0x08000000 = CREATE_NO_WINDOW，ShowWindow 0 = 隐藏。
  const commandLine = [exec, ...args].map((a) => `"${a}"`).join(" ");
  const script = [
    "$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0; CreateFlags = [uint32]0x08000000 }",
    "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:K1_CMDLINE; ProcessStartupInformation = $si }",
    "Write-Output ('{0} {1}' -f $r.ReturnValue, $r.ProcessId)",
  ].join("; ");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, K1_CMDLINE: commandLine },
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {});
  child.unref();
  return { pid: null, at: Date.now() };
}

// 连接，连不上就启动，再按握手表处理版本。identity = { kind: 'app' | 'cli', clientId }
// 返回 { conn, started, notice?, timings }；失败抛 ClientError：
//   SUPERVISOR_UNAVAILABLE / SUPERVISOR_OUTDATED / CLIENT_OUTDATED
export async function ensureSupervisor(cfg, identity, opts = {}) {
  const t0 = Date.now();
  const startDeadline = t0 + (opts.startTimeoutMs ?? 15_000);
  // noLaunch：只连接、不启动（实验里用来单独看“客户端能不能认出冒充者”）
  let started = Boolean(opts.noLaunch);
  let launchedAt = null;
  let impostorStrikes = 0;
  let lastImpostor = "";
  for (;;) {
    const tokenBefore = readDiscovery(cfg)?.token ?? null;
    const r = await connectOnce(cfg, identity, opts.connectTimeoutMs ?? 2_000);
    if (r.conn) {
      const verdict = await applyVersionTable(cfg, r.conn);
      if (verdict === "restart") {
        // 旧的管理进程答应退出了：等它放开连接点，再从头来
        await sleep(100);
        continue;
      }
      return { conn: r.conn, started, notice: verdict, timings: { totalMs: Date.now() - t0, sinceLaunchMs: launchedAt ? Date.now() - launchedAt : null } };
    }
    if (r.absent) {
      if (!started) {
        launchedAt = launchSupervisor(cfg, opts.launch).at;
        started = true;
      }
    } else {
      // 有人在听但没通过验证。可能只是时间差：新的管理进程刚监听上、发现文件还没换成它的口令。
      // 口令变了就不算数；口令没变还连续失败，就是冒充者（或坏掉的管理进程），不再尝试，也绝不去启动第二个。
      lastImpostor = r.impostor;
      const tokenAfter = readDiscovery(cfg)?.token ?? null;
      if (tokenAfter === tokenBefore) impostorStrikes++;
      if (impostorStrikes >= (opts.impostorStrikes ?? 3)) throw new ClientError("SUPERVISOR_UNAVAILABLE", `endpoint answered but is not a genuine supervisor (${lastImpostor})`);
      // 启动一次试试：拿不到单实例锁（真的管理进程还在，或 Windows 上管道被别人占着）它会自己退出，不会出现第二个；
      // POSIX 上拿到锁的新进程会把连接点上的残留或冒充者换掉。
      if (!started) {
        launchedAt = launchSupervisor(cfg, opts.launch).at;
        started = true;
      }
    }
    if (Date.now() > startDeadline) throw new ClientError("SUPERVISOR_UNAVAILABLE", lastImpostor || "did not start in time");
    await sleep(started ? 15 : 0);
  }
}

// §5.4 的握手表。返回 undefined（直接用）、'SUPERVISOR_OLDER_COMPAT'（兼容使用并提示）、'restart'（已请旧的退出）
async function applyVersionTable(cfg, conn) {
  const w = conn.welcome;
  if (w.protocol === cfg.protocol) return undefined;
  if (w.protocol < cfg.protocol) {
    if (w.runs === 0) {
      try {
        await conn.request("supervisor.shutdown", { ifIdle: true, reason: "upgrade" });
        await new Promise((r) => conn.socket.once("close", r));
        return "restart";
      } catch (err) {
        if (err.code !== "SUPERVISOR_BUSY") throw err; // 刚好有人起了一个运行：按“有运行”处理
      }
    }
    if (w.protocol >= cfg.minServerProtocol) return "SUPERVISOR_OLDER_COMPAT";
    conn.close();
    throw new ClientError("SUPERVISOR_OUTDATED", JSON.stringify({ found: w.protocol, required: cfg.minServerProtocol, runs: w.runs }));
  }
  if (cfg.protocol < w.minClientProtocol) {
    conn.close();
    throw new ClientError("CLIENT_OUTDATED", JSON.stringify({ found: cfg.protocol, required: w.minClientProtocol }));
  }
  return undefined; // 管理进程较新，但仍愿意服务这个客户端
}

export const supervisorEntry = SUPERVISOR_ENTRY;
export const spikeRoot = path.dirname(SUPERVISOR_ENTRY);
