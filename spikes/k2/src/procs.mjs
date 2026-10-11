// 进程表快照和“这次运行留下了谁”的三种查法：
//   1. 进程树：从启动起持续采样，记下根进程的所有后代（进程号 + 启动时间，防止进程号被复用后认错）；
//   2. 标记：给子进程的环境变量里放一个唯一标记，后代都会继承（macOS 用 ps -E，Linux 读 /proc，Windows 读不到别的进程的环境）；
//   3. 命令行和工作目录里出现临时目录的进程（工作目录：macOS 用 lsof，Linux 读 /proc，Windows 没有不写原生代码的办法）。
import { execFile, spawn } from "node:child_process";
import { readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "./ports.mjs";

const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: 20000, ...opts }, (err, stdout, stderr) =>
      resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }),
    );
  });
}

// ---------- POSIX ----------
async function posixSnapshot() {
  // LC_ALL=C：lstart 的写法随系统语言变，固定成英文才好切
  const r = await run("ps", ["-axww", "-o", "pid=,ppid=,pgid=,stat=,lstart=,command="], {
    env: { ...process.env, LC_ALL: "C" },
  });
  const procs = [];
  for (const line of r.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    procs.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      zombie: m[4].startsWith("Z"),
      start: m[5].replace(/\s+/g, " "),
      cmd: m[6],
    });
  }
  return procs;
}

// ---------- Windows：一个常驻的 PowerShell，每收到一行就回一份进程表（每次新起 PowerShell 要半秒以上，采样跟不上） ----------
const PS_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $sb = New-Object System.Text.StringBuilder
  Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate,Name,CommandLine | ForEach-Object {
    $cd = 0
    if ($_.CreationDate) { $cd = $_.CreationDate.ToFileTimeUtc() }
    $cl = ''
    if ($_.CommandLine) { $cl = ($_.CommandLine -replace "[\`t\`r\`n]", ' ') }
    [void]$sb.Append($_.ProcessId).Append("\`t").Append($_.ParentProcessId).Append("\`t").Append($cd).Append("\`t").Append($_.Name).Append("\`t").Append($cl).Append("\`n")
  }
  [Console]::Out.Write($sb.ToString())
  [Console]::Out.Write("<<END>>\`n")
  [Console]::Out.Flush()
}
`;

let winServer = null;
function winSnapshotServer(scriptDir) {
  const script = join(scriptDir, "k2-snapshot.ps1");
  writeFileSync(script, PS_SCRIPT);
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: true,
  });
  let buffer = "";
  const waiters = [];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let at = buffer.indexOf("<<END>>\n");
    while (at !== -1) {
      const body = buffer.slice(0, at);
      buffer = buffer.slice(at + 8);
      waiters.shift()?.(body);
      at = buffer.indexOf("<<END>>\n");
    }
  });
  child.on("exit", () => {
    for (const w of waiters.splice(0)) w("");
  });
  return {
    pid: child.pid,
    ask() {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("PowerShell 进程表快照 30 秒没有回应")), 30000);
        waiters.push((body) => {
          clearTimeout(timer);
          resolve(body);
        });
        child.stdin.write("s\n");
      });
    },
    stop() {
      child.stdin.end();
    },
  };
}

async function winSnapshot() {
  const body = await winServer.ask();
  const procs = [];
  for (const line of body.split("\n")) {
    const f = line.replace(/\r$/, "").split("\t");
    if (f.length < 5) continue;
    procs.push({ pid: Number(f[0]), ppid: Number(f[1]), start: Number(f[2]), name: f[3], cmd: f[4] || f[3], zombie: false });
  }
  return procs;
}

export function initProcs(scriptDir) {
  if (isWin) winServer = winSnapshotServer(scriptDir);
  return { helperPids: () => (winServer ? [winServer.pid] : []), stop: () => winServer?.stop() };
}

export const snapshot = () => (isWin ? winSnapshot() : posixSnapshot());

// ---------- 进程树采样 ----------
export class Tracker {
  constructor(rootPid) {
    this.rootPid = rootPid;
    this.known = new Map(); // pid → 进程记录（含启动时间）
    this.maxAlive = 0;
    this.running = false;
  }
  ingest(snap) {
    const byPid = new Map(snap.map((p) => [p.pid, p]));
    const same = (a, b) => a && b && a.start === b.start;
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of snap) {
        if (same(this.known.get(p.pid), p)) continue;
        const parent = this.known.get(p.ppid);
        const live = byPid.get(p.ppid);
        // Windows 的“父进程号”只是一个数字：父进程死后不会改，而进程号很快被复用。
        // 第 2 轮里就因此出过事：我们树上某个进程恰好拿到了一个早已死掉的 smss.exe 用过的进程号，
        // 开机时就在的 csrss、winlogon 的父进程号正是它，于是被当成“后代”，接着被当成残留结束掉，整台 CI 机器起不了新进程。
        // 所以必须同时满足：孩子的创建时间不早于父进程；父进程已死时，孩子还得是在“父进程最后一次被看到”后不久创建的。
        let viaParent;
        if (isWin) {
          const born = p.start > 0 && parent && parent.start > 0 && p.start >= parent.start;
          const whileParentAlive = same(parent, live) || (!live && parent && p.start <= parent.lastSeen + 20_000_000); // 2 秒，单位 100 纳秒
          viaParent = Boolean(born && whileParentAlive);
        } else {
          viaParent = parent && same(parent, live);
        }
        const viaGroup = !isWin && p.pgid === this.rootPid && this.known.has(this.rootPid);
        if (p.pid === this.rootPid ? this.known.size === 0 : viaParent || viaGroup) {
          this.known.set(p.pid, p);
          changed = true;
        }
      }
    }
    // 记下每个已知进程最后一次活着被看到的时刻（Windows：FILETIME，和创建时间同一个刻度）
    if (isWin) {
      const nowFt = (Date.now() + 11644473600000) * 10000;
      for (const k of this.known.values()) if (same(k, byPid.get(k.pid))) k.lastSeen = nowFt;
    }
    this.maxAlive = Math.max(this.maxAlive, this.alive(snap).length);
  }
  async sample() {
    const snap = await snapshot();
    this.ingest(snap);
    return snap;
  }
  start(intervalMs) {
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        await this.sample();
        // 分小段睡，停止采样时不用多等一整个间隔
        for (let slept = 0; this.running && slept < intervalMs; slept += 20) await sleep(20);
      }
    })();
  }
  async stop() {
    this.running = false;
    await this.loop;
  }
  // 记录过的后代里现在还活着的（进程号和启动时间都对得上，且不是僵尸）
  alive(snap) {
    const byPid = new Map(snap.map((p) => [p.pid, p]));
    return [...this.known.values()].filter((k) => {
      const p = byPid.get(k.pid);
      return p && p.start === k.start && !p.zombie;
    });
  }
  // 给人看的树：每行是 深度、进程号、命令行（截短）
  tree(snap, shorten) {
    const live = this.alive(snap);
    const ids = new Set(live.map((p) => p.pid));
    const depth = (p, n = 0) => (p.pid === this.rootPid || !ids.has(p.ppid) || n > 20 ? 0 : 1 + depth(this.known.get(p.ppid), n + 1));
    return live.map((p) => ({ depth: depth(p), pid: p.pid, ppid: p.ppid, cmd: shorten(p.cmd).slice(0, 160) }));
  }
}

// ---------- 标记扫描（POSIX） ----------
export async function scanEnvTag(tag) {
  const needle = `K2_TAG=${tag}`;
  if (isWin) return null; // 读不到
  if (isLinux) {
    const pids = [];
    for (const name of readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      try {
        if (readFileSync(`/proc/${name}/environ`, "latin1").includes(needle)) {
          const stat = readFileSync(`/proc/${name}/stat`, "latin1");
          if (!/\) Z /.test(stat)) pids.push(Number(name));
        }
      } catch {
        // 进程刚好没了，或不是自己的进程
      }
    }
    return pids;
  }
  const r = await run("ps", ["-axEww", "-o", "pid=,stat=,command="]);
  const pids = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.includes(needle)) continue;
    const m = /^\s*(\d+)\s+(\S+)/.exec(line);
    if (m && !m[2].startsWith("Z")) pids.push(Number(m[1]));
  }
  return pids;
}

// ---------- 工作目录扫描 ----------
export async function scanCwd(needle) {
  if (isWin) return null;
  if (isLinux) {
    const pids = [];
    for (const name of readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      try {
        if (readlinkSync(`/proc/${name}/cwd`).includes(needle)) pids.push(Number(name));
      } catch {
        // 同上
      }
    }
    return pids;
  }
  const r = await run("lsof", ["-a", "-d", "cwd", "-Fpn", "-u", String(process.getuid())]);
  const pids = [];
  let pid = null;
  for (const line of r.stdout.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && line.includes(needle)) pids.push(pid);
  }
  return pids;
}

// 命令行里出现 needle 的进程，去掉测试程序自己、它的祖先和它的帮手
export function scanCmdline(snap, needle, excludePids) {
  const byPid = new Map(snap.map((p) => [p.pid, p]));
  const skip = new Set(excludePids);
  for (let p = byPid.get(process.pid), n = 0; p && n < 30; p = byPid.get(p.ppid), n++) skip.add(p.pid);
  const lower = needle.toLowerCase();
  return snap.filter((p) => !skip.has(p.pid) && !p.zombie && p.cmd.toLowerCase().includes(lower)).map((p) => p.pid);
}

// 谁在监听 127.0.0.1:<port>（Windows：netstat -ano）。这就是设计里说的“按端口复查”。
export async function portOwner(port) {
  if (!isWin) return null;
  const r = await run("netstat", ["-ano", "-p", "TCP"]);
  for (const line of r.stdout.split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f.length >= 5 && f[3] === "LISTENING" && f[1].endsWith(`:${port}`)) return Number(f[4]);
  }
  return null;
}
