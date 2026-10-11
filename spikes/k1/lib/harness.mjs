// 实验共用的工具：临时状态目录、启动命令行和应用、等待条件、统计、清理。
// 每个临时目录的名字都带同一个随机标记（SESSION），我们启动的每个进程的命令行里因此都带着它；
// 清理和“有没有残留”的检查只认这个标记，不会碰到别人的进程。
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { connectOnce, spikeRoot } from "./client.mjs";
import { loadConfig, pathsOf } from "./config.mjs";

export const SESSION = `k1s${crypto.randomBytes(4).toString("hex")}`;
export const isWin = process.platform === "win32";
export const nodeExec = process.execPath;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const require = createRequire(import.meta.url);
// electron 包在普通 Node 里导出的是可执行文件的路径（第一次调用时才下载二进制）
export const electronExec = () => require("electron");

const states = [];
const ports = [];
let counter = 0;

// 新建一个互不相干的状态目录（相当于一个临时的 ~/.runyard），返回配置
export function newState(label, overrides = {}) {
  const base = process.env.K1_TMP_BASE || os.tmpdir();
  const stateDir = path.join(base, `${SESSION}-${++counter}-${label}`);
  fs.mkdirSync(stateDir, { recursive: true });
  const cfg = { ...loadConfig(["--state-dir", stateDir, "--profile", `${SESSION}-${counter}`, "--max-lifetime-ms", "240000"], {}), ...overrides };
  states.push(cfg);
  return cfg;
}

export const cfgArgs = (cfg) => [
  "--state-dir", cfg.stateDir, "--profile", cfg.profile, "--protocol", String(cfg.protocol),
  "--min-client", String(cfg.minClientProtocol), "--min-server", String(cfg.minServerProtocol),
  "--idle-exit-ms", String(cfg.idleExitMs), "--grace-ms", String(cfg.graceMs),
  "--max-lifetime-ms", String(cfg.maxLifetimeMs), "--lock", cfg.lockMode, "--hs", cfg.handshake,
];

const cleanEnv = (extra = {}) => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { ...env, ...extra };
};

// 跑一次命令行，拿它打印的那一行 JSON
export function cli(cfg, command, extra = [], opts = {}) {
  const began = Date.now();
  return new Promise((resolve) => {
    const child = spawn(opts.exec ?? nodeExec, [path.join(spikeRoot, "cli.mjs"), command, ...cfgArgs(cfg), ...extra], {
      env: cleanEnv(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      let json = null;
      try {
        json = JSON.parse(out.trim().split("\n").pop());
      } catch {
        json = { ok: false, code: "NO_OUTPUT", detail: err.slice(-500) };
      }
      resolve({ ...json, exitCode: code, wallMs: Date.now() - began });
    });
  });
}

// 一个一直连着的客户端（用普通 Node 进程扮演应用）。end() = 正常离开；kill() = 强杀
export function cliHold(cfg, command, extra = []) {
  const child = spawn(nodeExec, [path.join(spikeRoot, "cli.mjs"), command, ...cfgArgs(cfg), ...extra, "--hold"], {
    env: cleanEnv(),
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  const first = new Promise((resolve) => {
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("\n")) resolve(JSON.parse(out.split("\n")[0]));
    });
    child.on("close", () => resolve({ ok: false, code: "EXITED_EARLY" }));
  });
  return { child, first, end: () => child.stdin.end(), kill: () => child.kill("SIGKILL") };
}

// 启动真正的 Electron 应用，等它写出“已就绪”的状态
export async function startApp(cfg, { runs = [], clientId = crypto.randomUUID(), at = 0 } = {}) {
  const dir = path.join(cfg.stateDir, `app-${crypto.randomBytes(3).toString("hex")}`);
  fs.mkdirSync(dir, { recursive: true });
  const files = { config: path.join(dir, "config.json"), statusFile: path.join(dir, "status.json"), controlFile: path.join(dir, "quit"), userData: path.join(dir, "ud") };
  fs.writeFileSync(files.config, JSON.stringify({ cfgArgs: cfgArgs(cfg), clientId, runs, at, ...files }));
  const args = [path.join(spikeRoot, "electron-app"), `--user-data-dir=${files.userData}`];
  // CI 的 Linux 没有显卡，也没有配好的沙箱辅助程序；这两项只影响界面进程，与本实验无关
  if (process.platform === "linux") args.push("--no-sandbox", "--disable-gpu");
  const log = fs.openSync(path.join(dir, "app.log"), "a");
  const spawnedAt = Date.now();
  const child = spawn(electronExec(), args, { env: cleanEnv({ K1_APP_CONFIG: files.config }), stdio: ["ignore", log, log], windowsHide: true });
  fs.closeSync(log);
  const exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal, at: Date.now() })));
  const readStatus = () => {
    try {
      return JSON.parse(fs.readFileSync(files.statusFile, "utf8"));
    } catch {
      return null;
    }
  };
  const waited = await waitFor(() => readStatus() || child.exitCode !== null, 60_000);
  const status = readStatus();
  if (!status || status.phase !== "ready") {
    const tail = fs.readFileSync(path.join(dir, "app.log"), "utf8").slice(-1500);
    child.kill("SIGKILL");
    throw new Error(`Electron 应用没有就绪（等了 ${waited} ms）：${JSON.stringify(status)}\n${tail}`);
  }
  return { child, pid: child.pid, status, readStatus, exited, spawnedAt, clientId, quit: () => fs.writeFileSync(files.controlFile, "quit"), kill: () => child.kill("SIGKILL") };
}

export function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      ports.push(port);
      s.close(() => resolve(port));
    });
  });
}

export function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

// 轮询直到条件成立，返回用了多少毫秒；超时返回 -1
export async function waitFor(fn, timeoutMs, stepMs = 10) {
  const began = Date.now();
  for (;;) {
    if (await fn()) return Date.now() - began;
    if (Date.now() - began > timeoutMs) return -1;
    await sleep(stepMs);
  }
}

export const runGone = (run) => waitFor(async () => !alive(run.pid) && !(await portOpen(run.port)), 20_000);

export function readJsonl(file) {
  try {
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
export const startsOf = (cfg) => readJsonl(pathsOf(cfg).startsLog);
export const eventsOf = (cfg) => readJsonl(pathsOf(cfg).eventLog);
// 记录里处于“正在监听”而且进程还活着的管理进程
export const liveSupervisors = (cfg) => startsOf(cfg).filter((s) => s.phase === "listening" && alive(s.pid)).map((s) => s.pid);

// 用户的“开发服务器”：极小的 HTTP 服务，或者临时项目里的真 Vite
export const httpRun = (port, owner = "cli") => ({
  argv: [nodeExec, path.join(spikeRoot, "fixtures", "http-server.mjs"), String(port), `--k1=${SESSION}`],
  port,
  owner: owner === "tab" ? { kind: "tab", tabId: "t1" } : { kind: "cli" },
});
export function viteRun(cfg, port, owner = "cli") {
  const proj = path.join(cfg.stateDir, `proj-${port}`);
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, "index.html"), "<!doctype html><title>k1</title><h1>k1</h1>\n");
  const config = path.join(proj, "vite.config.mjs");
  fs.writeFileSync(config, `export default { server: { host: "127.0.0.1", port: ${port}, strictPort: true }, clearScreen: false };\n`);
  return {
    argv: [nodeExec, path.join(spikeRoot, "node_modules", "vite", "bin", "vite.js"), "--config", config],
    cwd: proj,
    port,
    owner: owner === "tab" ? { kind: "tab", tabId: "t1" } : { kind: "cli" },
  };
}
export const runArgs = (run) => ["--argv", JSON.stringify(run.argv), "--port", String(run.port), "--owner", run.owner.kind, ...(run.cwd ? ["--cwd", run.cwd] : [])];

export function stats(values) {
  const v = values.filter((x) => typeof x === "number" && x >= 0).sort((a, b) => a - b);
  if (v.length === 0) return { n: 0 };
  const q = (f) => v[Math.min(v.length - 1, Math.ceil(f * v.length) - 1)];
  return { n: v.length, min: v[0], median: q(0.5), p95: q(0.95), max: v[v.length - 1] };
}

export function killTree(pid) {
  try {
    if (isWin) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else process.kill(pid, "SIGKILL");
  } catch {
    // 已经不在了
  }
}

// 列出命令行里带本次标记的进程（不含自己）。清理和“残留为零”的证据都靠它。
// ours = 命令行里还带着本目录的路径（我们启动的程序都是这里的脚本，或这里装的 Electron、Vite）。
// 只有 ours 的才许强杀：别人的进程（比如正在查看临时目录的 shell）即使命令行里出现了标记也不碰，只如实列出。
export function sessionProcesses() {
  let rows;
  if (isWin) {
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${SESSION}*' -and $_.ProcessId -ne $PID } | ForEach-Object { '{0}\`t{1}' -f $_.ProcessId, $_.CommandLine }`;
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
    rows = out.split(/\r?\n/).filter(Boolean).map((l) => ({ pid: Number(l.split("\t")[0]), command: l.split("\t")[1] ?? "" })).filter((x) => !x.command.includes("Get-CimInstance"));
  } else {
    const out = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    rows = out.split("\n").filter((l) => l.includes(SESSION)).map((l) => ({ pid: Number(l.trim().split(/\s+/)[0]), command: l.trim().replace(/^\d+\s+/, "") }));
  }
  const root = spikeRoot.toLowerCase();
  return rows.filter((x) => x.pid !== process.pid).map((x) => ({ ...x, command: x.command.slice(0, 300), ours: x.command.toLowerCase().includes(root) }));
}

// 收拾一个状态目录：先请管理进程自己退出，再强杀记录在案而且还活着的，最后删目录
export async function cleanupState(cfg) {
  const r = await connectOnce(cfg, { kind: "cli", clientId: "cleanup" }, 1_000).catch(() => ({}));
  if (r.conn) {
    await r.conn.request("supervisor.shutdown", { ifIdle: false, reason: "user" }).catch(() => {});
    await waitFor(() => !alive(r.conn.welcome.pid), 8_000);
    r.conn.close();
  }
  for (const s of startsOf(cfg)) if (alive(s.pid) && ownedPid(s.pid)) killTree(s.pid);
  for (const e of eventsOf(cfg)) {
    if (e.event !== "run-spawned" || !alive(e.runPid) || !ownedPid(e.runPid)) continue;
    if (isWin) killTree(e.runPid);
    else {
      try {
        process.kill(-e.runPid, "SIGKILL");
      } catch {
        killTree(e.runPid);
      }
    }
  }
  for (let i = 0; i < 20; i++) {
    try {
      fs.rmSync(cfg.stateDir, { recursive: true, force: true });
      break;
    } catch {
      await sleep(250); // Windows：进程刚死，文件句柄要过一会儿才放开
    }
  }
}

// 进程号可能被系统复用：动手之前核对这个进程确实是我们启动的
function ownedPid(pid) {
  try {
    // Windows 上取命令行很慢，这里只核对程序名；带标记的核对留给最后的统一清扫
    if (isWin) return /^"(node|electron)\.exe"/i.test(execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true }));
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).includes(SESSION);
  } catch {
    return false;
  }
}

// 全部实验结束后：清掉所有状态目录，再查残留的进程、端口、目录
export async function finalCleanup() {
  for (const cfg of states) await cleanupState(cfg);
  await sleep(500);
  const leaked = sessionProcesses().filter((x) => x.ours);
  for (const proc of leaked) killTree(proc.pid);
  if (leaked.length) await sleep(1_000);
  const stillOpen = [];
  for (const port of ports) if (await portOpen(port)) stillOpen.push(port);
  const dirsLeft = states.map((s) => s.stateDir).filter((d) => fs.existsSync(d));
  const after = sessionProcesses();
  return { session: SESSION, statesCreated: states.length, leakedProcessesFoundAndKilled: leaked, processesAfter: after.filter((x) => x.ours), foreignProcessesMentioningMarker: after.filter((x) => !x.ours), portsChecked: ports.length, portsStillOpen: stillOpen, dirsLeft };
}
