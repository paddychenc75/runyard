// 启动一次运行、停止一次运行。这里就是被验证的“停止算法”（技术设计 §4.3、§4.4 的 stop、§7.2 第 2、3 行）。
//
// 停止办法（method）：
//   group         POSIX：子进程自成一个进程组；先向整组发终止信号，等 graceMs，再向整组发 SIGKILL
//   taskkill      Windows：taskkill /PID <pid> /T /F（node 直接启动子进程，和产品里的路径一样）
//   taskkill-obs  Windows：同上，但子进程放在一个“只观察、不杀”的 Job Object 里，由它给出进程树是否死光的权威答案
//   job           Windows：runyard-job.exe 建“关闭即杀”的 Job Object；停止 = 结束这个辅助程序
//   job-ctrlc     Windows：辅助程序自己开一个隐藏的控制台，停止时先向它发 Ctrl+C，超时再整组结束（设计里没有，本次顺带验证）
//   pty-ctrlc     Windows：node-pty 伪终端里写入 Ctrl+C（只为对比，设计已裁决不用）
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { now, sleep } from "./ports.mjs";
import { Tracker } from "./procs.mjs";

const isWin = process.platform === "win32";
const here = dirname(fileURLToPath(import.meta.url));
export const JOB_EXE = join(here, "..", "win", "runyard-job.exe");
const TASKKILL = isWin ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe") : null;

// 安全：只允许对自己启动的进程下手。任何 kill / taskkill 之前都过这一关。
const owned = new Set();
function assertOwned(pid) {
  if (!Number.isInteger(pid) || pid <= 1 || !owned.has(pid)) throw new Error(`拒绝结束不是本程序启动的进程：${pid}`);
}

// 按 PATH 找真实文件（§7.1 exec.which）。Windows 上要把 .exe/.cmd 找出来，Node 不许直接启动 .cmd（§7.2 第 1 行）。
export function which(name, env) {
  if (name === "node") return process.execPath;
  const exts = isWin ? [".exe", ".cmd", ".bat"] : [""];
  const pathVar = env.PATH ?? env.Path ?? "";
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const file = join(dir, name + ext);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

const quote = (s) => (/[\s"]/.test(s) ? `"${s}"` : s);

// 参数数组 → 真正交给系统的启动方式。.cmd 垫片包一层 cmd.exe（实验里的参数都不含特殊字符，转义从简）。
export function resolveCommand(argv, env) {
  const file = which(argv[0], env);
  if (!file) throw new Error(`找不到工具：${argv[0]}`);
  if (isWin && /\.(cmd|bat)$/i.test(file)) {
    const inner = [file, ...argv.slice(1)].map(quote).join(" ");
    return { file: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `"${inner}"`], verbatim: true, shim: true };
  }
  return { file, args: argv.slice(1), verbatim: false, shim: false };
}

function collectOutput(h, streams) {
  h.output = "";
  for (const s of streams) {
    s?.on("data", (chunk) => {
      h.output = (h.output + chunk.toString()).slice(-6000);
    });
  }
}

export function startRun({ argv, cwd, env, method, reportFile, sampleMs }) {
  const cmd = resolveCommand(argv, env);
  const h = { method, argv, startedAt: now(), reportFile, shim: cmd.shim };

  if (method === "pty-ctrlc") {
    // 只有这一处用原生模块，而且只为对比
    const pty = createRequire(join(here, "..", "pty", "package.json"))("node-pty");
    const term = pty.spawn(cmd.file, cmd.args, { name: "xterm-256color", cols: 120, rows: 30, cwd, env });
    h.term = term;
    h.rootPid = term.pid;
    h.output = "";
    term.onData((d) => {
      h.output = (h.output + d).slice(-6000);
    });
    h.exited = new Promise((resolve) => term.onExit(({ exitCode, signal }) => resolve({ code: exitCode, signal: signal ?? null, at: now() })));
    h.closed = h.exited;
  } else {
    let file = cmd.file;
    let args = cmd.args;
    const useHelper = method === "taskkill-obs" || method === "job" || method === "job-ctrlc";
    if (useHelper) {
      const flags = { "taskkill-obs": ["--observe"], job: [], "job-ctrlc": ["--console", "--stdin-control"] }[method];
      args = [...flags, "--", cmd.verbatim ? cmd.file : quote(cmd.file), ...(cmd.verbatim ? cmd.args : cmd.args.map(quote))];
      file = JOB_EXE;
    }
    const child = spawn(file, args, {
      cwd,
      env: { ...env, RUNYARD_JOB_REPORT: reportFile ?? "" },
      stdio: [method === "job-ctrlc" ? "pipe" : "ignore", "pipe", "pipe"],
      detached: !isWin, // POSIX：自成进程组（setsid），之后才能整组发信号
      windowsHide: true,
      windowsVerbatimArguments: useHelper || cmd.verbatim,
    });
    h.child = child;
    h.rootPid = child.pid;
    collectOutput(h, [child.stdout, child.stderr]);
    // 注意等的是 exit 不是 close：孙进程拿着管道的写端时 close 永远不来
    h.exited = new Promise((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal, at: now() }));
      child.on("error", (err) => resolve({ code: null, signal: null, error: String(err), at: now() }));
    });
    h.closed = new Promise((resolve) => child.on("close", () => resolve(now())));
    child.stdin?.on("error", () => {});
  }
  if (h.rootPid) owned.add(h.rootPid);
  h.tracker = new Tracker(h.rootPid);
  h.tracker.start(sampleMs);
  return h;
}

const withTimeout = (promise, ms) => Promise.race([promise, sleep(ms).then(() => "timeout")]);

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return err.code !== "ESRCH";
  }
}

async function waitGroupEmpty(pgid, ms) {
  const deadline = now() + ms;
  while (now() < deadline) {
    if (!groupAlive(pgid)) return true;
    await sleep(10);
  }
  return !groupAlive(pgid);
}

function taskkill(pid) {
  assertOwned(pid);
  const startedAt = now();
  return new Promise((resolve) => {
    execFile(TASKKILL, ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, (err, stdout, stderr) =>
      resolve({ what: "taskkill /T /F", code: err ? (err.code ?? 1) : 0, ms: now() - startedAt, out: `${stdout}${stderr}`.trim().slice(0, 3000) }),
    );
  });
}

// 读辅助程序写的报告（每行 key=value）
export function readReport(file) {
  if (!file || !existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

// mode：graceful（终止信号）、interrupt（中断信号）、kill（直接强制结束）
export async function stopRun(h, { mode, graceMs }) {
  const steps = [];
  const t0 = now();
  const step = (what, extra = {}) => steps.push({ what, at: Math.round(now() - t0), ...extra });
  let escalated = false;
  assertOwned(h.rootPid);

  if (h.method === "group") {
    const first = mode === "kill" ? "SIGKILL" : mode === "interrupt" ? "SIGINT" : "SIGTERM";
    if (groupAlive(h.rootPid)) {
      process.kill(-h.rootPid, first);
      step(`整组 ${first}`);
    }
    if (!(await waitGroupEmpty(h.rootPid, mode === "kill" ? 5000 : graceMs))) {
      escalated = mode !== "kill";
      if (groupAlive(h.rootPid)) process.kill(-h.rootPid, "SIGKILL");
      step("超时，整组 SIGKILL");
      await waitGroupEmpty(h.rootPid, 5000);
    }
    step("进程组已空");
  } else if (h.method === "taskkill") {
    steps.push(await taskkill(h.rootPid));
  } else if (h.method === "taskkill-obs") {
    // 辅助程序把真正的根进程号写在报告里；等它出现
    let childPid = null;
    for (let i = 0; i < 200 && !childPid; i++) {
      childPid = Number(readReport(h.reportFile).child) || null;
      if (!childPid) await sleep(10);
    }
    if (!childPid) throw new Error("观察用的辅助程序没有报出子进程号");
    owned.add(childPid);
    steps.push(await taskkill(childPid));
  } else if (h.method === "job") {
    h.child.kill(); // Windows 上就是 TerminateProcess：辅助程序一死，Job 的最后一个句柄关闭，里面的进程全部结束
    step("结束辅助程序");
  } else if (h.method === "job-ctrlc") {
    if (mode === "kill") {
      h.child.stdin.write("kill\n");
      step("kill");
    } else {
      h.child.stdin.write("ctrlc\n");
      step("Ctrl+C");
      if ((await withTimeout(h.exited, graceMs)) === "timeout") {
        escalated = true;
        h.child.stdin.write("kill\n");
        step("超时，结束整个 Job");
      }
    }
    if ((await withTimeout(h.exited, 3000)) === "timeout") {
      h.child.kill();
      step("辅助程序没退出，直接结束它");
    }
  } else if (h.method === "pty-ctrlc") {
    try {
      h.term.write("\x03");
      step("写入 Ctrl+C");
    } catch (err) {
      step(`写入 Ctrl+C 抛错 ${err.message}`);
    }
    if ((await withTimeout(h.exited, graceMs)) === "timeout") {
      escalated = true;
      try {
        h.term.kill();
      } catch (err) {
        step(`kill 抛错 ${err.message}`);
      }
      step("超时，pty.kill()");
    }
  }
  const exit = await withTimeout(h.exited, 12000);
  return { steps, escalated, exit: exit === "timeout" ? { timeout: true } : { code: exit.code, signal: exit.signal }, rootExitMs: exit === "timeout" ? null : exit.at - t0 };
}

// 兜底清理：只结束采样记录过、而且进程号和启动时间都对得上的进程。
// Windows 上再加两道保险（见 procs.mjs 里那次事故）：必须是这次运行的根进程启动之后才创建的，而且程序名是实验里会出现的那几种。
const WIN_KILLABLE = /^(node|python|go|k2go|esbuild|uv|cmd|conhost|runyard-job|pnpm|powershell|git)\.exe$/i;
export function killLeftover(proc, snap, rootStart) {
  const live = snap.find((p) => p.pid === proc.pid && p.start === proc.start);
  if (!live) return false;
  if (isWin && !(proc.start > 0 && rootStart > 0 && proc.start >= rootStart && WIN_KILLABLE.test(proc.name ?? ""))) return false;
  try {
    process.kill(proc.pid, "SIGKILL");
    return true;
  } catch {
    return false;
  }
}

export function forgetRun(h) {
  h.child?.stdout?.destroy();
  h.child?.stderr?.destroy();
  h.child?.stdin?.destroy();
}
