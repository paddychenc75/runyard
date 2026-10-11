// 实验 E：管理进程能否活过启动它的程序（脚本、shell、关闭即杀的进程分组），以及 Windows 上的黑窗口。
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { spikeRoot } from "../lib/client.mjs";
import { alive, cfgArgs, cleanupState, cli, electronExec, freePort, httpRun, isWin, killTree, liveSupervisors, newState, nodeExec, portOpen, runArgs, SESSION, sleep, waitFor } from "../lib/harness.mjs";

const cliPath = path.join(spikeRoot, "cli.mjs");
const fixture = (name) => path.join(spikeRoot, "fixtures", name);
const baseEnv = () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
};

// 启动者消失之后等一会儿，再确认管理进程还活着而且还能握手
async function verdict(cfg, supPid, settleMs = 2_500) {
  await sleep(settleMs);
  const info = alive(supPid) ? await cli(cfg, "supervisor.info", ["--no-launch", "--start-timeout-ms", "2000"]) : { ok: false };
  return { survived: alive(supPid) && info.ok && info.supervisorPid === supPid, launcher: info.result?.launcher };
}

// ---------- macOS / Linux ----------

async function posixCase(variant, launcher) {
  const cfg = newState("pe");
  try {
    const exec = launcher === "electron" ? electronExec() : nodeExec;
    const env = launcher === "electron" ? { ...baseEnv(), ELECTRON_RUN_AS_NODE: "1" } : baseEnv();
    const controlPort = await freePort();
    // 对照：同一个 shell 里再起一个没有脱钩的后台进程，它应当随整组被杀而死，证明“杀整组”确实生效
    const control = variant === "parent-exits" ? "" : `"${nodeExec}" "${fixture("http-server.mjs")}" ${controlPort} --k1=${SESSION} & `;
    const linger = variant === "parent-exits" ? "" : "; sleep 60";
    const sh = spawn("/bin/sh", ["-c", `${control}"$@"${linger}`, "sh", exec, cliPath, "ensure", ...cfgArgs(cfg)], { detached: true, stdio: "ignore", env });
    const shExited = new Promise((resolve) => sh.once("exit", resolve));
    if ((await waitFor(() => liveSupervisors(cfg).length === 1, 15_000)) < 0) return { variant, launcher, error: "管理进程没有起来" };
    const supPid = liveSupervisors(cfg)[0];
    if (variant === "parent-exits") {
      await shExited;
    } else {
      await waitFor(() => portOpen(controlPort), 5_000);
      if (variant === "group-sighup-then-sigkill") {
        process.kill(-sh.pid, "SIGHUP"); // 终端关闭时发给前台进程组的信号
        try {
          process.kill(supPid, "SIGHUP"); // 再直接发给管理进程一次：它应当忽略
        } catch {
          // 已经死了的话下面会如实记成没活下来
        }
        await sleep(200);
      }
      try {
        process.kill(-sh.pid, "SIGKILL");
      } catch {
        // SIGHUP 已经把整组结束了
      }
      await shExited;
    }
    const v = await verdict(cfg, supPid);
    const ppid = v.survived ? Number(execFileSync("ps", ["-o", "ppid=", "-p", String(supPid)], { encoding: "utf8" }).trim()) : null;
    return { variant, launcher, ...v, ppidAfter: ppid, controlDied: variant === "parent-exits" ? undefined : !(await portOpen(controlPort)) };
  } finally {
    await cleanupState(cfg);
  }
}

// ---------- Windows ----------

// 别的进程刚写完的文件可能还被占着（EBUSY）：短暂重试
async function readSoon(file) {
  for (let i = 0; ; i++) {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch (err) {
      if (i >= 40) throw err;
      await sleep(50);
    }
  }
}
// 一个情形出错不该丢掉其余情形的结果
const guarded = (label, fn) => fn().catch((err) => ({ ...label, error: String(err.message ?? err).slice(0, 300) }));

const q = (s) => `"${s}"`;
const sq = (s) => `'${s}'`;

// 四种 shell：各自写一个脚本文件（免得在命令行里处理三套引号规则），脚本里启动命令行后一直等着
function shellScript(shell, cfg, launcher, extra = []) {
  const exec = launcher === "electron" ? electronExec() : nodeExec;
  const args = ["ensure", ...cfgArgs(cfg), ...extra];
  const dir = cfg.stateDir;
  if (shell === "cmd") {
    const file = path.join(dir, "start.cmd");
    fs.writeFileSync(file, [`@echo off`, launcher === "electron" ? "set ELECTRON_RUN_AS_NODE=1" : "rem", `${[exec, cliPath, ...args].map(q).join(" ")} > ${q(path.join(dir, "cli-out.json"))}`, "ping -n 60 127.0.0.1 > nul", ""].join("\r\n"));
    return { command: "cmd.exe", args: ["/d", "/c", file] };
  }
  if (shell === "powershell" || shell === "pwsh") {
    const file = path.join(dir, "start.ps1");
    fs.writeFileSync(file, [launcher === "electron" ? "$env:ELECTRON_RUN_AS_NODE = '1'" : "", `& ${[exec, cliPath, ...args].map(sq).join(" ")} | Out-File -Encoding ascii ${sq(path.join(dir, "cli-out.json"))}`, "Start-Sleep -Seconds 60", ""].join("\r\n"));
    return { command: `${shell}.exe`, args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file] };
  }
  const file = path.join(dir, "start.sh");
  fs.writeFileSync(file, [launcher === "electron" ? "export ELECTRON_RUN_AS_NODE=1" : "", `${[exec, cliPath, ...args].map(sq).join(" ")} > ${sq(path.join(dir, "cli-out.json"))}`, "sleep 60", ""].join("\n"));
  return { command: "C:\\Program Files\\Git\\bin\\bash.exe", args: [file] };
}

async function windowsShellCase(shell, launcher) {
  const cfg = newState("pe");
  try {
    const s = shellScript(shell, cfg, launcher);
    const child = spawn(s.command, s.args, { stdio: "ignore", env: baseEnv(), windowsHide: true });
    let spawnError = null;
    child.on("error", (err) => (spawnError = err.code));
    if ((await waitFor(() => spawnError || liveSupervisors(cfg).length === 1, 30_000)) < 0 || spawnError) return { shell, launcher, error: spawnError ?? "管理进程没有起来" };
    const supPid = liveSupervisors(cfg)[0];
    const shellAliveBefore = alive(child.pid);
    killTree(child.pid); // taskkill /T /F：结束这个 shell 和它名下的整棵进程树
    const v = await verdict(cfg, supPid);
    return { shell, launcher, ...v, shellAliveBefore, shellDied: !alive(child.pid) };
  } finally {
    await cleanupState(cfg);
  }
}

// Job Object 的限制位
const JOB = { none: 0, killOnClose: 0x2000, killOnCloseBreakawayOk: 0x2000 | 0x800, killOnCloseSilentBreakaway: 0x2000 | 0x1000 };

async function windowsJobCase(flagsName, via) {
  const cfg = newState("pj");
  try {
    const s = shellScript("cmd", cfg, "node", via ? ["--via", via] : []);
    // 脚本只负责启动；等待放在 job-host 里。去掉脚本末尾的 ping
    fs.writeFileSync(s.args[2], fs.readFileSync(s.args[2], "utf8").replace(/ping -n 60.*\r\n/, ""));
    const statusFile = path.join(cfg.stateDir, "job-status.txt");
    const host = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", fixture("job-host.ps1"), "-Script", s.args[2], "-LimitFlags", String(JOB[flagsName]), "-StatusFile", statusFile], { stdio: "ignore", env: baseEnv(), windowsHide: true });
    if ((await waitFor(() => fs.existsSync(statusFile), 60_000, 50)) < 0) return { job: flagsName, via: via ?? "spawn", error: "job-host 没有写出状态" };
    const jobStatus = await readSoon(statusFile);
    let cliOut = null;
    try {
      cliOut = JSON.parse(await readSoon(path.join(cfg.stateDir, "cli-out.json")));
    } catch {
      // 留空，下面如实报告
    }
    const supPid = liveSupervisors(cfg)[0];
    if (!supPid) {
      const tail = (name) => {
        try {
          return fs.readFileSync(path.join(cfg.stateDir, "logs", name), "utf8").slice(-600);
        } catch {
          return null;
        }
      };
      return { job: flagsName, via: via ?? "spawn", jobStatus, error: "管理进程没有起来", cliOut, diag: { cim: tail("cim-launch.log"), starts: tail("starts.jsonl"), out: tail("supervisor.out.log") } };
    }
    // 只杀 job-host 自己（不带 /T）：Job 的句柄随之关闭，剩下的交给系统按 Job 的规则处理
    execFileSync("taskkill", ["/PID", String(host.pid), "/F"], { stdio: "ignore", windowsHide: true });
    const v = await verdict(cfg, supPid);
    return { job: flagsName, via: via ?? "spawn", jobStatus, ...v, launchToHandshakeMs: cliOut?.timings?.sinceLaunchMs };
  } finally {
    await cleanupState(cfg);
  }
}

export async function parentExit({ quick }) {
  const rounds = quick ? 1 : 5;
  if (!isWin) {
    const cases = [];
    for (const launcher of ["node", "electron"]) {
      for (const variant of ["parent-exits", "group-sigkill", "group-sighup-then-sigkill"]) {
        for (let i = 0; i < rounds; i++) cases.push(await posixCase(variant, launcher));
      }
    }
    const summary = {};
    for (const c of cases) {
      const key = `${c.launcher}/${c.variant}`;
      summary[key] ??= { rounds: 0, survived: 0, controlDied: 0, ppids: [] };
      summary[key].rounds++;
      if (c.survived) summary[key].survived++;
      if (c.controlDied) summary[key].controlDied++;
      if (c.ppidAfter && !summary[key].ppids.includes(c.ppidAfter)) summary[key].ppids.push(c.ppidAfter);
    }
    return { pass: cases.every((c) => c.survived && c.controlDied !== false), summary, failures: cases.filter((c) => !c.survived || c.controlDied === false) };
  }
  const shells = [];
  const shellRounds = quick ? 1 : 3;
  for (const shell of ["powershell", "pwsh", "cmd", "git-bash"]) {
    for (let i = 0; i < shellRounds; i++) shells.push(await guarded({ shell, launcher: "node" }, () => windowsShellCase(shell, "node")));
  }
  for (const shell of ["powershell", "cmd"]) shells.push(await guarded({ shell, launcher: "electron" }, () => windowsShellCase(shell, "electron")));
  const jobs = [];
  const jobRounds = quick ? 1 : 3;
  for (const [flags, via] of [["none", undefined], ["killOnClose", undefined], ["killOnClose", "cim"], ["killOnCloseBreakawayOk", undefined], ["killOnCloseSilentBreakaway", undefined]]) {
    for (let i = 0; i < jobRounds; i++) jobs.push(await guarded({ job: flags, via: via ?? "spawn" }, () => windowsJobCase(flags, via)));
  }
  const count = (list, keyOf) => {
    const out = {};
    for (const c of list) {
      const key = keyOf(c);
      out[key] ??= { rounds: 0, survived: 0, errors: [] };
      out[key].rounds++;
      if (c.survived) out[key].survived++;
      if (c.error) out[key].errors.push(c.error);
      if (c.diag && !out[key].diag) out[key].diag = c.diag;
      if (c.jobStatus && !out[key].jobStatus) out[key].jobStatus = c.jobStatus;
      if (c.launchToHandshakeMs) (out[key].launchToHandshakeMs ??= []).push(c.launchToHandshakeMs);
    }
    return out;
  };
  return {
    // 判定只看“从 shell 启动后结束 shell 的进程树”这一项（任务书里 CI 部分的要求）；Job 的几种情况是对风险的摸底
    pass: shells.every((c) => c.survived),
    shells: count(shells, (c) => `${c.shell}/${c.launcher}`),
    jobObject: count(jobs, (c) => `${c.job}/${c.via}`),
    note: "CI 的 Windows 机器在任务结束时会清掉残留进程，所以存活只在任务之内测量（启动者被结束后 2.5 秒）",
  };
}

// Windows：管理进程没有控制台，它启动的控制台程序会不会各自弹出一个黑窗口
export async function hiddenWindows() {
  if (!isWin) return { skipped: "只在 Windows 上有意义" };
  const query = (pids) => {
    const list = pids.join(",");
    const script = `Get-Process -Id ${list} -ErrorAction SilentlyContinue | ForEach-Object { 'proc {0} {1} hwnd={2}' -f $_.Id, $_.ProcessName, $_.MainWindowHandle }; Get-CimInstance Win32_Process -Filter "Name='conhost.exe'" | Where-Object { @(${list}) -contains $_.ParentProcessId } | ForEach-Object { 'conhost {0} parent={1}' -f $_.ProcessId, $_.ParentProcessId }`;
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true }).split(/\r?\n/).filter(Boolean);
  };
  const cfg = newState("hw");
  try {
    const out = { spawnOptions: { supervisor: "spawn(execPath, args, { detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true })", runChild: "spawn(argv0, rest, { stdio: ['ignore', logFd, logFd], windowsHide: true })" }, proxy: {} };
    // 真的管理进程和它起的运行
    const first = await cli(cfg, "ensure");
    const run = (await cli(cfg, "run", runArgs(httpRun(await freePort())))).result;
    out.proxy.supervisorAndRun = query([first.supervisorPid, run.pid]);
    // 对照：同样没有控制台的父进程，子进程分别带和不带 windowsHide
    for (const hide of ["true", "false"]) {
      const file = path.join(cfg.stateDir, `spawner-${hide}.json`);
      const spawner = spawn(nodeExec, [fixture("win-spawner.mjs"), hide, String(await freePort()), file, `--k1=${SESSION}`], { detached: true, stdio: "ignore", windowsHide: true });
      spawner.unref();
      await waitFor(() => fs.existsSync(file), 10_000);
      await sleep(1_500);
      const pids = JSON.parse(fs.readFileSync(file, "utf8"));
      out.proxy[`childWindowsHide=${hide}`] = query([pids.spawner, pids.child]);
      killTree(pids.child);
      killTree(pids.spawner);
    }
    // CI 的机器没有可见的桌面，这里只能看“有没有给子进程新建控制台宿主（conhost）和窗口句柄”这个替代指标
    return { pass: null, ...out, note: "肉眼确认要在负责人的 Windows 电脑上做" };
  } finally {
    await cleanupState(cfg);
  }
}
