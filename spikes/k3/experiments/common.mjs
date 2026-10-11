// 两个系统的实验共用的工具：临时根目录和指针文件、和应用说话、计时统计、只杀自己启动的进程。
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pointerPath } from "../runtime/k3-pointer.mjs";

export const k3Root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const k1Root = path.join(path.dirname(k3Root), "k1");
export const isWin = process.platform === "win32";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(`[k3 ${new Date().toISOString().slice(11, 19)}]`, ...a);

export function sh(cmd, args = [], opts = {}) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: opts.timeoutMs ?? 120_000, maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms: Number(process.hrtime.bigint() - t0) / 1e6, error: r.error ? String(r.error.code ?? r.error) : undefined };
}

export function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  const at = (q) => v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)];
  const r = (x) => Math.round(x * 10) / 10;
  return { n: v.length, min: r(v[0]), median: r(at(0.5)), p95: r(at(0.95)), max: r(v[v.length - 1]), mean: r(v.reduce((a, b) => a + b, 0) / v.length) };
}

export async function waitFor(fn, timeoutMs = 10_000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const got = await fn();
    if (got) return got;
    if (Date.now() > deadline) return null;
    await sleep(stepMs);
  }
}

export const alive = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
};

// 进程的启动时间（文本）。进程号会被重用，所以“是不是我启动的那个”要靠 进程号 + 启动时间 一起认
export function procStart(pid) {
  try {
    if (isWin) return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`], { encoding: "utf8", windowsHide: true }).trim();
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });

export function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total;
}
export const mb = (bytes) => Math.round((bytes / 2 ** 20) * 10) / 10;

// 一次实验的临时根目录。里面是：s/（状态目录，相当于 ~/.runyard）、userdata/、control/、reply/、app-events.jsonl
export class Session {
  constructor() {
    const base = process.env.K3_TMP_BASE || fs.realpathSync(os.tmpdir());
    this.root = fs.mkdtempSync(path.join(base, "k3s-"));
    this.tag = path.basename(this.root);
    this.stateDir = path.join(this.root, "s");
    this.tracked = new Map(); // pid → { start, what }
    this.seq = 0;
    fs.mkdirSync(this.stateDir, { recursive: true });
    this.cfgArgs = [
      "--state-dir", this.stateDir,
      // Windows 的管道名只由 profile 决定，带上随机标记，和别的实验互不相干
      "--profile", `k3-${crypto.randomBytes(3).toString("hex")}`,
      "--idle-exit-ms", "600000",
      // 保险：管理进程最多活 10 分钟，测试程序崩了也不会留在机器上
      "--max-lifetime-ms", "600000",
    ];
    fs.writeFileSync(path.join(this.root, "app-config.json"), JSON.stringify({ cfgArgs: this.cfgArgs, maxAppLifetimeMs: 240_000 }, null, 2));
    this.pointer = pointerPath();
    fs.mkdirSync(path.dirname(this.pointer), { recursive: true });
    fs.writeFileSync(this.pointer, JSON.stringify({ root: this.root }));
  }

  events() {
    try {
      return fs.readFileSync(path.join(this.root, "app-events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  discovery() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.stateDir, "run", "supervisor.json"), "utf8"));
    } catch {
      return null;
    }
  }

  supervisorLog() {
    try {
      return fs.readFileSync(path.join(this.stateDir, "logs", "supervisor.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  track(pid, what) {
    if (pid && !this.tracked.has(pid)) this.tracked.set(pid, { start: procStart(pid), what });
    return pid;
  }

  // 只结束自己登记过、而且启动时间没变的进程
  killTracked(pid) {
    const t = this.tracked.get(pid);
    if (!t || !alive(pid)) return false;
    if (procStart(pid) !== t.start) return false;
    if (isWin) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    else process.kill(pid, "SIGKILL");
    return true;
  }

  // 给应用发一条指令并等回执
  async control(cmd, extra = {}, timeoutMs = 15_000) {
    const id = `c${++this.seq}-${crypto.randomBytes(2).toString("hex")}`;
    const dir = path.join(this.root, "control");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.tmp`), JSON.stringify({ id, cmd, ...extra }));
    fs.renameSync(path.join(dir, `${id}.tmp`), path.join(dir, `${id}.json`));
    const replyFile = path.join(this.root, "reply", `${id}.json`);
    const got = await waitFor(() => fs.existsSync(replyFile), timeoutMs, 25);
    if (!got) {
      fs.rmSync(path.join(dir, `${id}.json`), { force: true });
      return { ok: false, error: "no-reply" };
    }
    return JSON.parse(fs.readFileSync(replyFile, "utf8"));
  }

  // 等某个应用实例走到 up（或失败）。返回它的全部事件
  async waitAppUp(sinceIndex, timeoutMs = 30_000) {
    const boot = await waitFor(() => this.events().slice(sinceIndex).find((e) => e.event === "boot"), timeoutMs);
    if (!boot) return { started: false };
    this.track(boot.pid, "app");
    const mine = () => this.events().slice(sinceIndex).filter((e) => e.pid === boot.pid);
    const end = await waitFor(() => mine().find((e) => ["up", "failed", "second-instance-exit"].includes(e.event)), timeoutMs);
    return { started: true, pid: boot.pid, boot, up: end?.event === "up", end: end?.event ?? null, events: mine() };
  }

  async quitApp(pid) {
    if (!alive(pid)) return { wasAlive: false };
    const t0 = Date.now();
    const reply = await this.control("quit", { pid }, 5_000);
    const gone = await waitFor(() => !alive(pid), 10_000);
    const forced = gone ? false : this.killTracked(pid);
    return { wasAlive: true, reply, ms: Date.now() - t0, forced };
  }

  // 收尾：登记过的进程一个不留，删临时根目录和指针文件
  cleanup() {
    const report = { killed: [], rootRemoved: false, pointerRemoved: false };
    const d = this.discovery();
    if (d?.pid && alive(d.pid)) this.track(d.pid, "supervisor(discovery)");
    for (const [pid, t] of this.tracked) if (this.killTracked(pid)) report.killed.push({ pid, what: t.what });
    try {
      fs.rmSync(this.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      report.rootRemoved = !fs.existsSync(this.root);
    } catch (err) {
      report.rootError = String(err.code ?? err);
    }
    fs.rmSync(this.pointer, { force: true });
    if (isWin) fs.rmSync(path.dirname(this.pointer), { recursive: true, force: true });
    report.pointerRemoved = !fs.existsSync(this.pointer);
    return report;
  }
}

export function writeResults(name, data) {
  const dir = path.join(k3Root, "results");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}
