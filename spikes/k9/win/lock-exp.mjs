// K9b 实验 1：刚停掉开发服务器的项目，多久能改名；被占用时怎么发现“被谁占用”。
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import * as G from "../lib/guard.mjs";
import { sleepMs, now, round, run, stats, renameUntilOk, freePort, listFiles, ps } from "./util.mjs";

const here = import.meta.dirname;

export function setupViteProject(root) {
  const proj = path.join(root, G.newName("vite"));
  G.assertInRoot(proj);
  fs.mkdirSync(proj);
  for (const f of ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"]) fs.copyFileSync(path.join(here, "..", f), path.join(proj, f));
  fs.writeFileSync(path.join(proj, G.MARKER), G.token() + "\n");
  fs.writeFileSync(path.join(proj, "index.html"), '<!doctype html><html><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>\n');
  fs.writeFileSync(path.join(proj, "main.js"), 'import { x } from "./dep.js";\ndocument.getElementById("app").textContent = x;\n');
  fs.writeFileSync(path.join(proj, "dep.js"), 'export const x = "hello";\n');
  const t0 = now();
  const r = run("pnpm", ["install", "--frozen-lockfile"], { cwd: proj, shell: true, timeout: 600000 });
  if (r.status !== 0) throw new Error("pnpm install 失败: " + (r.stderr || r.stdout).slice(0, 400));
  return { proj, installMs: round(now() - t0) };
}

async function startVite(proj) {
  const port = await freePort();
  const bin = path.join(proj, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [bin, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: proj, stdio: "ignore", windowsHide: true });
  const t0 = now();
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok) break;
    } catch {}
    if (now() - t0 > 30000) throw new Error("vite 没起来");
    await new Promise((r) => setTimeout(r, 50));
  }
  // 请求一遍模块，让 vite 把文件读进去、挂上监听
  for (const u of ["/@vite/client", "/main.js", "/dep.js"]) await fetch(`http://127.0.0.1:${port}${u}`).then((r) => r.text()).catch(() => {});
  return { child, port, startMs: round(now() - t0) };
}

export const killTree = (pid) => run("taskkill", ["/T", "/F", "/PID", String(pid)]);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A：停掉 vite 后立刻改名，重复 n 次 */
export async function viteStopRename(proj, n = 30) {
  const alt = proj + "-r";
  const times = [];
  const codes = {};
  const failures = [];
  const startMs = [];
  for (let i = 0; i < n; i++) {
    const v = await startVite(proj);
    startMs.push(v.startMs);
    const pid = v.child.pid;
    killTree(pid);
    const r = renameUntilOk(proj, alt, 15000, 10);
    for (const [k, c] of Object.entries(r.codes)) codes[k] = (codes[k] || 0) + c;
    if (r.ok) times.push(r.ms);
    else failures.push(r);
    if (fs.existsSync(alt)) fs.renameSync(alt, proj);
    if (alive(pid)) failures.push({ stillAlive: pid });
  }
  return { n, ok: times.length, renameMs: stats(times), errorCodesSeen: codes, failures, viteStartMs: stats(startMs), note: "taskkill /T /F 返回后立刻开始计时；每次间隔 10ms 重试" };
}

/** 被占用的几种形式：返回每种的首次错误码、释放后的等待时间 */
export async function lockedCases(proj, n = 10) {
  const alt = proj + "-r";
  const helperJs = path.join(G.root(), "holder.js");
  fs.writeFileSync(
    helperJs,
    `const fs=require("fs");const m=process.argv[2];const p=process.argv[3];
if(m==="open"){fs.openSync(p,"r");}
if(m==="watch"){fs.watch(p,()=>{});}
setInterval(()=>{},1000);console.log("ready");`,
  );
  const holderPs = path.join(G.root(), "holder.ps1");
  fs.writeFileSync(holderPs, `$f=[System.IO.File]::Open($args[0],'Open','Read','Read');Write-Output ready;Start-Sleep -Seconds 600`);
  const cases = {
    "cwd-in-folder": () => spawn(process.execPath, [helperJs, "cwd"], { cwd: proj, stdio: "ignore", windowsHide: true }),
    "node-open-file(libuv shares delete)": () => spawn(process.execPath, [helperJs, "open", path.join(proj, "dep.js")], { stdio: "ignore", windowsHide: true }),
    "powershell-open-file(no FILE_SHARE_DELETE)": () => spawn("powershell.exe", ["-NoProfile", "-File", holderPs, path.join(proj, "dep.js")], { stdio: "ignore", windowsHide: true }),
    "dir-watcher(fs.watch on folder)": () => spawn(process.execPath, [helperJs, "watch", proj], { stdio: "ignore", windowsHide: true }),
    "dir-watcher(fs.watch on subfolder)": () => spawn(process.execPath, [helperJs, "watch", path.join(proj, "node_modules")], { stdio: "ignore", windowsHide: true }),
  };
  const out = {};
  for (const [name, start] of Object.entries(cases)) {
    const firstErr = {};
    const releaseMs = [];
    let blocked = 0;
    for (let i = 0; i < n; i++) {
      const child = start();
      sleepMs(name.startsWith("powershell") ? 2500 : 800); // 给助手进程时间真正占住
      try {
        fs.renameSync(proj, alt);
        // 居然成功了：说明这种占用不拦改名
        fs.renameSync(alt, proj);
      } catch (e) {
        blocked++;
        firstErr[e.code] = (firstErr[e.code] || 0) + 1;
      }
      const pid = child.pid;
      killTree(pid);
      const r = renameUntilOk(proj, alt, 15000, 10);
      if (r.ok) {
        releaseMs.push(r.ms);
        fs.renameSync(alt, proj);
      }
    }
    out[name] = { reps: n, renameBlocked: blocked, firstErrorCodes: firstErr, msToSucceedAfterKill: stats(releaseMs) };
  }
  return out;
}

/** 发现占用者：三种办法各自能认出哪几种占用 */
export function detectionMatrix(proj, helpers) {
  const helperJs = path.join(G.root(), "holder.js");
  const holderPs = path.join(G.root(), "holder.ps1");
  const dep = path.join(proj, "dep.js");
  const spawned = [];
  const mk = (cmd, args, o = {}) => {
    const c = spawn(cmd, args, { stdio: "ignore", windowsHide: true, ...o });
    spawned.push(c.pid);
    return c;
  };
  const scenarios = {
    "cwd-in-folder": () => mk(process.execPath, [helperJs, "cwd"], { cwd: proj }),
    "node-open-file": () => mk(process.execPath, [helperJs, "open", dep]),
    "powershell-open-file": () => mk("powershell.exe", ["-NoProfile", "-File", holderPs, dep]),
    "dir-watcher": () => mk(process.execPath, [helperJs, "watch", proj]),
    "exe-inside-folder": () => {
      const exe = path.join(proj, "node-copy.exe");
      if (!fs.existsSync(exe)) fs.copyFileSync(process.execPath, exe);
      return mk(exe, [helperJs, "cwd"]);
    },
  };
  const res = {};
  const listFile = path.join(G.root(), "files.txt");
  for (const [name, start] of Object.entries(scenarios)) {
    const child = start();
    const pid = child.pid;
    try {
    sleepMs(name.startsWith("powershell") ? 2500 : 1000);
    const r = {};
    // 办法 1：命令行或可执行文件路径里带有该目录（PowerShell CIM）
    let t = now();
    const p1 = ps(`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${proj.replace(/'/g, "''")}*' -or $_.ExecutablePath -like '${proj.replace(/'/g, "''")}*' } | ForEach-Object { $_.ProcessId }`);
    r.cimCmdline = { found: p1.stdout.split(/\s+/).includes(String(pid)), ms: round(now() - t) };
    // 办法 2：Restart Manager（文件列表）
    fs.writeFileSync(listFile, [...listFiles(proj, 3000), proj].join("\n"));
    t = now();
    const p2 = run(helpers.lockers, [listFile]);
    if (p2.stdout === null || p2.stdout === undefined) throw new Error("lockers.exe 没有输出: " + p2.error);
    r.restartManager = { found: p2.stdout.split("\n").some((l) => l.startsWith(pid + "\t")), ms: round(now() - t), raw: p2.stdout.trim().slice(0, 120) };
    // 办法 3：读每个进程的 PEB 取当前目录
    t = now();
    const p3 = run(helpers.lockers, ["cwd", proj]);
    r.pebCwd = { found: p3.stdout.split("\n").some((l) => l.startsWith(pid + "\t")), ms: round(now() - t) };
    res[name] = r;
    } catch (e) {
      res[name] = { error: String(e).slice(0, 200) };
    } finally {
      killTree(pid);
      sleepMs(300);
    }
  }
  return res;
}
