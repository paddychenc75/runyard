// K9b 实验主程序（在 windows-2025 运行器上跑）。用法：node win/run.mjs [--quick]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as G from "../lib/guard.mjs";
import { run, ps, now, round, stats } from "./util.mjs";
import * as L from "./lock-exp.mjs";
import * as B from "./bin-exp.mjs";
import { renameEdgeCases } from "./rename-exp.mjs";
import { makeTree } from "../lib/make-tree.mjs";

// 调试用：win/args.txt 里的参数追加到命令行后面（推送触发时没法传参数）
const extra = fs.existsSync(path.join(import.meta.dirname, "args.txt")) ? fs.readFileSync(path.join(import.meta.dirname, "args.txt"), "utf8").trim().split(/\s+/).filter(Boolean) : [];
const ARGV = [...process.argv.slice(2), ...extra];
const QUICK = ARGV.includes("--quick");
const onlyArg = ARGV.indexOf("--only");
const ONLY = onlyArg >= 0 ? ARGV[onlyArg + 1].split(",") : null; // 例：--only diag,bin-30k
const want = (n) => !ONLY || ONLY.includes(n);
const dump = () => {
  fs.mkdirSync(path.join(import.meta.dirname, "..", "results"), { recursive: true });
  fs.writeFileSync(path.join(import.meta.dirname, "..", "results", "windows.json"), JSON.stringify(results, null, 2));
};
const ROOT = G.makeRoot(os.homedir()); // 不能用系统临时目录：那里删除的东西不进回收站
const results = { label: "windows", node: process.version, exps: {}, cleanup: {} };
const log = (...a) => console.log("[k9]", ...a);
async function exp(name, fn) {
  if (!want(name.split(":")[0])) return;
  log("==", name);
  const t = now();
  try {
    results.exps[name] = await fn();
  } catch (e) {
    results.exps[name] = { error: String(e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e) };
  }
  log(`(${round(now() - t)} ms)`, JSON.stringify(results.exps[name]).slice(0, 1500));
  dump();
}
const regRestore = [];
const SINGLE_FLAGS = (0x40 | 0x10 | 0x4 | 0x400 | 0x80000 | 0x100000).toString(16);

try {
  const drive = path.parse(ROOT).root.replace(/\\$/, ""); // 如 D:
  results.env = {
    ver: ps("(Get-CimInstance Win32_OperatingSystem).Caption + ' ' + (Get-CimInstance Win32_OperatingSystem).Version").stdout.trim(),
    root: ROOT,
    drive,
    isAdmin: ps("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)").stdout.trim(),
    defender: (ps("Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,BehaviorMonitorEnabled,IoavProtectionEnabled,OnAccessProtectionEnabled,AntivirusSignatureVersion | ConvertTo-Json -Compress").stdout || "").trim(),
    longPathsEnabled: run("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem", "/v", "LongPathsEnabled"]).stdout.trim().split(/\s+/).pop(),
    psVersion: ps("$PSVersionTable.PSVersion.ToString()").stdout.trim(),
  };
  log("env", JSON.stringify(results.env));

  // 编译两个小工具（.NET Framework 自带的 csc.exe）
  const csc = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
  const helperExe = path.join(ROOT, "trash.exe");
  const lockersExe = path.join(ROOT, "lockers.exe");
  await exp("compile-helpers", () => {
    const out = {};
    for (const [src, exe, extra] of [["Trash.cs", helperExe, []], ["Lockers.cs", lockersExe, []]]) {
      const t = now();
      const r = run(csc, ["/nologo", "/optimize+", "/platform:x64", `/out:${exe}`, path.join(import.meta.dirname, src), ...extra]);
      out[src] = { status: r.status, ms: round(now() - t), bytes: fs.existsSync(exe) ? fs.statSync(exe).size : 0, err: (r.stdout + r.stderr).trim().slice(0, 300) };
    }
    return out;
  });

  // ---------- 实验 1：停掉 vite 后改名 ----------
  let viteProj = null;
  await exp("vite-setup", () => {
    const s = L.setupViteProject(ROOT);
    viteProj = s.proj;
    return { installMs: s.installMs, files: G.root() && fs.readdirSync(path.join(viteProj, "node_modules")).length };
  });
  if (viteProj) {
    await exp("vite-stop-then-rename", () => L.viteStopRename(viteProj, QUICK ? 3 : 30));
    await exp("locked-cases", () => L.lockedCases(viteProj, QUICK ? 2 : 10));
    await exp("lock-detection", () => L.detectionMatrix(viteProj, { lockers: lockersExe }));
  }

  // ---------- 实验 3：改名边界 ----------
  await exp("rename-edge-cases", () => {
    const r = path.join(ROOT, "edge");
    fs.mkdirSync(r);
    return renameEdgeCases(r);
  });

  // ---------- 实验 2：回收站 ----------
  const bin = B.binInfo(drive);
  B.setVolumeKey(B.volumeKey(drive));
  results.env.recycleBinDir = bin.dir;
  const npmJs = path.join(import.meta.dirname, "npm-trash.mjs");
  const cands = B.candidates(helperExe, fs.existsSync(path.join(import.meta.dirname, "..", "node_modules", "trash")) ? npmJs : null);
  await exp("diag", () => B.diagnose(ROOT, bin, drive, helperExe));
  await exp("bin-readable", () => {
    const e = B.binEntries(bin);
    return { err: e.err, entries: e.items.length };
  });

  if (want("bin")) {
  const trials = [];
  results.exps["bin-30k"] = trials;
  const FILES = QUICK ? 2000 : 30000;
  for (const [name, fn] of Object.entries(cands)) {
    log("== 30k", name);
    try {
      const r = B.trial(ROOT, bin, name, fn, "tree", FILES);
      trials.push(r);
      log(JSON.stringify(r).slice(0, 500));
    } catch (e) {
      trials.push({ cand: name, error: String(e).slice(0, 200) });
    }
  }
  // 速度的重复：最有希望的两个再各跑 2 次
  if (!QUICK) {
    const reps = [];
    for (const name of Object.keys(cands).filter((n) => n.startsWith("exe-ifo-recycle(") || n.startsWith("ps-visual"))) {
      for (let i = 0; i < 2; i++) reps.push(B.trial(ROOT, bin, name + "#rep" + (i + 2), cands[name], "tree", FILES));
    }
    results.exps["bin-30k-repeats"] = reps;
    log(JSON.stringify(reps).slice(0, 1200));
  }

  // PowerShell 启动开销
  await exp("powershell-startup", () => {
    const ts = [];
    for (let i = 0; i < 5; i++) {
      const t = now();
      ps("Add-Type -AssemblyName Microsoft.VisualBasic; 1");
      ts.push(now() - t);
    }
    const hs = [];
    for (let i = 0; i < 5; i++) {
      const t = now();
      run(helperExe, ["x"]);
      hs.push(now() - t);
    }
    return { powershellLoadVB: stats(ts), helperExeNoop: stats(hs) };
  });

  // 容量不足和“不要移到回收站”：改注册表（运行器是一次性虚拟机；结束时还原）
  const vkey = B.volumeKey(drive);
  B.setVolumeKey(vkey);
  results.env.volumeKey = vkey;
  const dangerous = [];
  results.exps["bin-over-capacity"] = dangerous;
  if (vkey) {
    const prevMax = B.regGet(vkey, "MaxCapacity");
    const prevNuke = B.regGet(vkey, "NukeOnDelete");
    regRestore.push(() => {
      prevMax === null ? B.regDel(vkey, "MaxCapacity") : B.regSet(vkey, "MaxCapacity", parseInt(prevMax, 16));
      prevNuke === null ? B.regDel(vkey, "NukeOnDelete") : B.regSet(vkey, "NukeOnDelete", parseInt(prevNuke, 16));
    });
    B.regSet(vkey, "MaxCapacity", 1); // 1 MB
    results.env.maxCapacityNow = B.regGet(vkey, "MaxCapacity");
    for (const [name, fn] of Object.entries(cands)) {
      try {
        const r = B.trial(ROOT, bin, name, fn, "big", 30);
        r.scenario = "folder 25MB > MaxCapacity 1MB";
        dangerous.push(r);
        log(JSON.stringify(r).slice(0, 400));
      } catch (e) {
        dangerous.push({ cand: name, error: String(e).slice(0, 200) });
      }
    }
    B.regDel(vkey, "MaxCapacity");
    if (prevMax !== null) B.regSet(vkey, "MaxCapacity", parseInt(prevMax, 16));
    // 用户设置了“删除时不要移到回收站”（NukeOnDelete=1）
    B.regSet(vkey, "NukeOnDelete", 1);
    results.env.nukeNow = B.regGet(vkey, "NukeOnDelete");
    const nuke = [];
    results.exps["bin-nuke-on-delete"] = nuke;
    for (const [name, fn] of Object.entries(cands)) {
      try {
        const r = B.trial(ROOT, bin, name, fn, "tree", 50);
        r.scenario = "NukeOnDelete=1";
        nuke.push(r);
        log(JSON.stringify(r).slice(0, 400));
      } catch (e) {
        nuke.push({ cand: name, error: String(e).slice(0, 200) });
      }
    }
    B.regDel(vkey, "NukeOnDelete");
    if (prevNuke !== null) B.regSet(vkey, "NukeOnDelete", parseInt(prevNuke, 16));
  }

  // 超长路径（> MAX_PATH）：不带前缀和带 \\?\ 前缀各试
  const lp = [];
  results.exps["bin-long-path"] = lp;
  for (const [name, fn] of Object.entries(cands)) {
    for (const prefix of [false, true]) {
      try {
        const r = B.trial(ROOT, bin, name + (prefix ? " [\\\\?\\ path]" : ""), fn, "longpath", 20, prefix);
        lp.push(r);
        log(JSON.stringify(r).slice(0, 400));
      } catch (e) {
        lp.push({ cand: name, error: String(e).slice(0, 200) });
      }
    }
  }

  }

  await exp("rm-30k-direct-delete", () => {
    // §12 第 16 项的对照：依赖目录直接删除要多久（只对本脚本自己造的临时树做）
    const r = [];
    for (let i = 0; i < 3; i++) {
      const d = path.join(ROOT, G.newName("rm"));
      makeTree(d, { files: QUICK ? 2000 : 30000, symlinks: false, xattrs: false, bigMB: 1, deep: false });
      const t = now();
      G.removeInRoot(d);
      r.push(round(now() - t));
    }
    return { rmMsPerRun: r, note: "removeInRoot = 先放开只读再 fs.rmSync；Defender 实时保护在运行器上是关的" };
  });

  if (want("bin-path-scan")) {
    await exp("bin-path-scan", () => ({
      "exe-ifo-quiet": B.pathLengthScan(ROOT, bin, cands["exe-ifo-quiet(UNDO|NOCONFIRM|SILENT|NOERRORUI)"], [200, 240, 259, 260, 261, 300, 400, 500, 520, 600, 800, 1000, 1500]),
      "ps-visualbasic": B.pathLengthScan(ROOT, bin, cands["ps-visualbasic"], [240, 259, 260, 300, 400, 500, 600, 1000]),
      "exe-ifo-recycleonly": B.pathLengthScan(ROOT, bin, cands["exe-ifo-recycleonly(RECYCLEONDELETE|NOCONFIRM|SILENT|NOERRORUI, no UNDO)"], [259, 300, 520, 560, 600, 800, 1000]),
      ...(cands["npm-trash@10.1.1(windows-trash.exe)"] ? { "npm-trash@10.1.1": B.pathLengthScan(ROOT, bin, cands["npm-trash@10.1.1(windows-trash.exe)"], [259, 300, 520, 560, 600, 800, 1000]) } : {}),
    }));
  }

  // 单文件命令行里带着小工具：把 exe 以 base64 嵌进一个 .mjs，运行时写到临时目录再调用
  await exp("single-file-embed", () => {
    const b64 = fs.readFileSync(helperExe).toString("base64");
    const single = path.join(ROOT, "runyard-single.mjs");
    fs.writeFileSync(
      single,
      `import fs from "node:fs";import os from "node:os";import path from "node:path";import {spawnSync} from "node:child_process";
const B64="${b64}";
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ry-helper-"));const exe=path.join(dir,"trash.exe");
fs.writeFileSync(exe,Buffer.from(B64,"base64"));
const r=spawnSync(exe,["ifo","${SINGLE_FLAGS}",process.argv[2]],{encoding:"utf8"});
fs.rmSync(dir,{recursive:true,force:true});console.log(r.stdout.trim());process.exit(r.status);`,
    );
    const before = B.binEntries(bin).items;
    const d = path.join(ROOT, G.newName("single"));
    makeTree(d, { files: 100, symlinks: false, xattrs: false, bigMB: 0, deep: false });
    const t = now();
    const r = run(process.execPath, [single, d]);
    const oc = B.outcome(bin, before, d);
    if (fs.existsSync(d)) G.removeInRoot(d);
    return { exeBytes: fs.statSync(helperExe).size, scriptBytes: fs.statSync(single).size, status: r.status, ms: round(now() - t), verdict: oc.verdict };
  });
} finally {
  for (const f of regRestore) {
    try {
      f();
    } catch {}
  }
  // 清理：杀掉本次启动的残留进程（按路径匹配临时根，且只杀 node/powershell/vite 相关）
  const left = ps(`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${ROOT.replace(/'/g, "''")}*' -and $_.ProcessId -ne ${process.pid} } | Select-Object ProcessId,Name | ConvertTo-Json -Compress`).stdout.trim();
  results.cleanup.leftoverProcessesBefore = left;
  try {
    const procs = left ? [].concat(JSON.parse(left)) : [];
    for (const p of procs) run("taskkill", ["/T", "/F", "/PID", String(p.ProcessId)]);
  } catch {}
  try {
    G.removeRoot();
  } catch (e) {
    results.cleanup.rootErr = String(e).slice(0, 200);
  }
  results.cleanup.rootGone = !fs.existsSync(ROOT);
  fs.mkdirSync(path.join(import.meta.dirname, "..", "results"), { recursive: true });
  fs.writeFileSync(path.join(import.meta.dirname, "..", "results", "windows.json"), JSON.stringify(results, null, 2));
  console.log("cleanup", JSON.stringify(results.cleanup));
}
