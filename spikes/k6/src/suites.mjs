// 其余实验：真实 shell、模拟 Finder 启动、真实 GUI 启动、计时、按项目目录、消融、回退评分。
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { CASES } from "./cases.mjs";
import { SANDBOX_ROOT, compareAll, groundTruth, gtToTools, isGood, runCase, runCaseVariants, shellPath } from "./lab.mjs";
import { captureOnce, buildCommand, dotfileStamp, findLoginShell, resolveLoginEnv, shellKind } from "./resolve-env.mjs";
import { detectAll, scanFallbackEnv } from "./tools.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "cli.mjs");
const HOME = os.homedir();
const USER = os.userInfo().username;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const stats = (a) => ({ n: a.length, min: Math.round(Math.min(...a)), median: Math.round(pct(a, 0.5)), p95: Math.round(pct(a, 0.95)), max: Math.round(Math.max(...a)) });
const launchdLikeEnv = () => ({ HOME, USER, LOGNAME: USER, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", TMPDIR: process.env.TMPDIR ?? "/tmp/", XPC_FLAGS: "0x0", LANG: "en_US.UTF-8" });

// ---- 5.1 真实 shell（只读）：对照 = 在真实 HOME 里开真正的交互登录 shell（伪终端）
export async function real() {
  const kind = shellKind(findLoginShell().shell);
  const gt = gtToTools(groundTruth(kind, HOME, HOME, 40, { USER, real: true }));
  const naive = await detectAll(launchdLikeEnv(), HOME);
  const res = await resolveLoginEnv({ baseEnv: launchdLikeEnv(), cwd: HOME });
  const resolved = await detectAll(res.env, HOME);
  const scan = await detectAll(scanFallbackEnv(HOME, launchdLikeEnv()), HOME);
  const { env, ...meta } = res;
  const out = { login: findLoginShell(), meta, gt, compare: { naive: compareAll(gt, naive), resolver: compareAll(gt, resolved), scan: compareAll(gt, scan) }, resolved, scan, naive };
  console.log(JSON.stringify({ login: out.login, ms: Math.round(meta.ms), compare: out.compare }, null, 1));
  return out;
}

// ---- 2. 模拟 Finder：env -i 启动 cli.mjs（真实 HOME 和一个沙箱）
export async function finder() {
  const r = spawnSync("/usr/bin/env", ["-i", ...Object.entries(launchdLikeEnv()).map(([k, v]) => `${k}=${v}`), process.execPath, CLI], { encoding: "utf8", timeout: 30000 });
  const j = JSON.parse(r.stdout);
  console.log(JSON.stringify({ receivedKeys: j.received.keys, login: j.login, ms: Math.round(j.meta.ms), node: j.tools?.node }, null, 1));
  return j;
}

// ---- 2b. 真正由 LaunchServices 启动：临时 .app，脚本可执行文件，open -W 启动
export async function gui() {
  if (process.platform !== "darwin") return { skipped: "not macOS" };
  // macOS 上 `open` 会把调用者的环境带给被启动的 app（本机实测，见 README）。所以分两种：
  // 终端环境下 open；以及 `open` 自己也拿极简环境（最接近 Finder / Dock 的情形）
  const out = {};
  out["open from a terminal (full env passed through)"] = await guiOnce(process.env);
  out["open with a launchd-like minimal env"] = await guiOnce(launchdLikeEnv());
  return out;
}
async function guiOnce(openEnv) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "runyard-k6-app-"));
  const app = path.join(dir, "K6Probe.app");
  const out = path.join(dir, "out");
  try {
    mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
    mkdirSync(out);
    // 代码复制到临时目录：从 LaunchServices 启动的进程读 ~/Desktop 会触发 TCC 权限弹窗并一直等用户点击
    const code = path.join(dir, "code");
    mkdirSync(code);
    for (const f of ["cli.mjs", "resolve-env.mjs", "tools.mjs"]) cpSync(path.join(HERE, f), path.join(code, f));
    writeFileSync(path.join(app, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>k6probe</string>
<key>CFBundleIdentifier</key><string>dev.runyard.k6probe</string>
<key>CFBundleName</key><string>K6Probe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSBackgroundOnly</key><true/>
</dict></plist>`);
    const exe = path.join(app, "Contents/MacOS/k6probe");
    writeFileSync(exe, `#!/bin/sh\n# 记录 LaunchServices 实际给的环境，再运行解析器\n/usr/bin/env > "${out}/received-env.txt"\n"${process.execPath}" "${code}/cli.mjs" > "${out}/result.json" 2> "${out}/stderr.txt"\n`);
    chmodSync(exe, 0o755);
    const t0 = performance.now();
    try {
      execFileSync("/usr/bin/open", ["-W", "-n", app], { timeout: 45000, env: openEnv });
    } catch (e) {
      // 超时：把现场打出来，并杀掉我们自己拉起的探针进程（命令行含本次临时目录名）
      console.log("open failed:", String(e.message).slice(0, 80), "\nstderr:", existsSync(path.join(out, "stderr.txt")) ? readFileSync(path.join(out, "stderr.txt"), "utf8") : "(none)");
      try { execFileSync("/usr/bin/pkill", ["-f", dir]); } catch {}
      throw e;
    }
    const wall = performance.now() - t0;
    const envTxt = readFileSync(path.join(out, "received-env.txt"), "utf8");
    const keys = envTxt.split("\n").map((l) => l.split("=")[0]).filter(Boolean).sort();
    const result = JSON.parse(readFileSync(path.join(out, "result.json"), "utf8"));
    const received = Object.fromEntries(envTxt.split("\n").filter((l) => /^(PATH|SHELL|HOME|USER|TERM|TERM_PROGRAM|LANG|TMPDIR)=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
    const summary = { receivedKeys: keys, received, wallMs: Math.round(wall), resolverMs: Math.round(result.meta.ms), ok: result.meta.ok, login: result.login, node: result.tools?.node, python: result.tools?.python };
    console.log(JSON.stringify(summary, null, 1));
    return summary;
  } finally {
    // 只删我们创建的临时目录（含 .app）
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 5. 计时（真实 shell）
async function timeMany(n, fn) { const a = []; for (let i = 0; i < n; i++) a.push(await fn()); return stats(a); }
const wallOf = (cmd, args, env) => async () => { const t = performance.now(); await promisify(execFile)(cmd, args, { env, timeout: 30000 }).catch(() => {}); return performance.now() - t; };

export async function timing(N = 25) {
  const env = launchdLikeEnv();
  const { shell } = findLoginShell();
  const kind = shellKind(shell);
  const res = {};
  const cap = (extra) => async () => (await captureOnce({ shell, kind, cwd: HOME, baseEnv: env, ...extra })).ms;
  // 第一次（冷启动：这轮进程之前没有跑过解析器；系统文件缓存无法可靠清除，所以"冷"只指第一次）
  const first = await cap({})();
  res.firstRunMs = Math.round(first);
  res.resolver_full_earlyExit = await timeMany(N, cap({}));
  res.resolver_no_earlyExit = await timeMany(N, cap({ earlyExit: false }));
  res.resolver_no_warmup_no_hooks = await timeMany(N, cap({ warmup: false, hooks: false }));
  res.noninteractive_lc = await timeMany(N, cap({ interactive: false }));
  res.shell_lic_exit = await timeMany(N, wallOf(shell, ["-l", "-i", "-c", "exit"], env));
  res.shell_lc_true = await timeMany(N, wallOf(shell, ["-l", "-c", "true"], env));
  res.shell_f_true = await timeMany(N, wallOf(shell, ["-f", "-c", "true"], env));
  res.node_spawn_baseline = await timeMany(N, wallOf(process.execPath, ["-e", "0"], env));
  // 缓存命中：读缓存文件 + stat 启动文件
  const cacheFile = path.join(SANDBOX_ROOT, "env-cache.json");
  const full = await resolveLoginEnv({ baseEnv: env, cwd: HOME });
  writeFileSync(cacheFile, JSON.stringify({ stamp: dotfileStamp(kind, HOME, env), env: full.env }));
  const hits = [];
  for (let i = 0; i < 2000; i++) { const t = performance.now(); const c = JSON.parse(readFileSync(cacheFile, "utf8")); if (c.stamp !== dotfileStamp(kind, HOME, env)) throw new Error("stamp"); hits.push((performance.now() - t) * 1000); }
  res.cache_hit_microseconds = { n: hits.length, median: Math.round(pct(hits, 0.5)), p95: Math.round(pct(hits, 0.95)), max: Math.round(Math.max(...hits)) };
  // 分项：detectAll（which + 5 个 --version）
  res.detectAll_after_resolve = await timeMany(10, async () => { const t = performance.now(); await detectAll(full.env, HOME); return performance.now() - t; });
  // zprof：把用户的启动文件复制到临时 ZDOTDIR（只读复制），在副本顶部加 zprof；原文件不动
  if (kind === "zsh") {
    const zd = mkdtempSync(path.join(os.tmpdir(), "runyard-k6-zprof-"));
    try {
      writeFileSync(path.join(zd, ".zshenv"), "zmodload zsh/zprof\n" + (existsSync(path.join(HOME, ".zshenv")) ? readFileSync(path.join(HOME, ".zshenv"), "utf8") : ""));
      for (const f of [".zprofile", ".zshrc", ".zlogin"]) {
        const src = path.join(HOME, f);
        if (existsSync(src)) writeFileSync(path.join(zd, f), readFileSync(src, "utf8") + (f === ".zshrc" ? "\nzprof | head -14\n" : ""));
      }
      const r = spawnSync(shell, ["-l", "-i", "-c", "exit"], { env: { ...env, ZDOTDIR: zd }, encoding: "utf8", timeout: 30000 });
      res.zprof_top = (r.stdout || "").split("\n").filter((l) => /^\s*\d+\)|^num/.test(l)).slice(0, 12).map((l) => l.replace(/\/Users\/[^/]+/g, "~"));
    } finally { rmSync(zd, { recursive: true, force: true }); }
  }
  console.log(JSON.stringify(res, null, 1));
  return res;
}

// ---- 6/消融：同一批用例，不同的解析策略
export async function ablation(kinds) {
  const variants = {
    full: {},
    "no-hooks": { hooks: false },
    "no-warmup": { warmup: false },
    "no-hooks-no-warmup": { hooks: false, warmup: false },
    "login-noninteractive-only": { strategy: "noninteractive-only" },
    "interactive-only-no-stdin-fallback": { strategy: "interactive-only" },
  };
  const agg = Object.fromEntries(Object.keys(variants).map((v) => [v, { variant: v, good: 0, total: 0, bad: [] }]));
  for (const def of CASES) for (const kind of kinds) {
    const r = await runCaseVariants(def, kind, variants);
    if (!r) continue;
    for (const [v, res] of Object.entries(r)) {
      const cells = typeof res === "string" ? [] : Object.entries(res).filter(([, s]) => s !== "both-missing");
      for (const [tool, st] of cells) { agg[v].total++; if (isGood(st)) agg[v].good++; else agg[v].bad.push(`${def.id}/${kind}/${tool}=${st}`); }
    }
  }
  for (const a of Object.values(agg)) console.log(`${a.variant}: ${a.good}/${a.total}${a.bad.length ? "  bad: " + a.bad.join(", ") : ""}`);
  return Object.values(agg);
}

// ---- 6. 按项目目录：三种做法对比
export async function projectCwd(kinds) {
  const rows = [];
  for (const def of CASES.filter((d) => d.project)) for (const kind of kinds) {
    const out = { case: def.id, kind };
    for (const [name, o] of Object.entries({ "capture@project+detect@project": { cwdMode: "project", captureCwdMode: "project" }, "capture@home+detect@project": { cwdMode: "project", captureCwdMode: "home" }, "capture@home+detect@home(全局缓存)": { cwdMode: "project", captureCwdMode: "home", resolveOpts: {} } })) {
      let r;
      if (name.startsWith("capture@home+detect@home")) {
        // 全局答案：不管项目，直接拿家目录里的检测结果，去和"项目里的终端"对照
        const base = await runCase(def, kind, { cwdMode: "project", captureCwdMode: "home" });
        if (base.skipped) { out.skipped = base.skipped; break; }
        const globalRes = await runCase(def, kind, { cwdMode: "home", captureCwdMode: "home" });
        out[name] = compareAll(base.detail.gt, globalRes.detail.resolved);
        continue;
      }
      r = await runCase(def, kind, o);
      if (r.skipped) { out.skipped = r.skipped; break; }
      out[name] = r.resolver;
    }
    if (out.skipped) continue;
    rows.push(out);
    console.log(def.id, kind, JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => k.startsWith("capture")).map(([k, v]) => [k, summarize(v)]))));
  }
  return rows;
}
const summarize = (r) => (typeof r === "string" ? r : Object.entries(r).filter(([, s]) => s !== "both-missing" && s !== "same" && s !== "same(real)").map(([k, s]) => `${k}:${s}`).join(",") || "all-match");

// ---- 7. 回退评分：从 matrix.json 汇总
export function score(rows) {
  const t = { pairs: 0, naive: 0, resolver: 0, scan: 0 };
  const perScanBad = {};
  for (const r of rows) {
    if (typeof r.resolver === "string") continue;
    for (const tool of Object.keys(r.resolver)) {
      const gtMissing = r.naive[tool] === "both-missing" && r.resolver[tool] === "both-missing" && r.scan[tool] === "both-missing";
      if (gtMissing) continue;
      t.pairs++;
      if (isGood(r.naive[tool])) t.naive++;
      if (isGood(r.resolver[tool])) t.resolver++;
      if (isGood(r.scan[tool])) t.scan++; else (perScanBad[`${r.case}/${r.kind}/${r.cwdMode}`] ??= []).push(`${tool}:${r.scan[tool]}`);
    }
  }
  return { ...t, scanBad: perScanBad };
}
