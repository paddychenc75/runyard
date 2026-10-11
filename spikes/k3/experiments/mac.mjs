// K3 的 macOS 实验。用法：node experiments/mac.mjs [--ci] [--label 名字] [--runs 40] [--only a,b]
// --ci 只在一次性的 CI 机器上加：会做“带隔离标记直接打开”和“发系统通知”，这两项可能在屏幕上弹框，
// 在负责人的 Mac 上不做。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "../scripts/build.mjs";
import { alive, dirSize, freePort, k1Root, k3Root, log, mb, portOpen, Session, sh, sleep, stats, waitFor, writeResults } from "./common.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const CI = argv.includes("--ci");
const RUNS = Number(opt("runs", 40));
const only = opt("only")?.split(",");
const want = (name) => !only || only.includes(name);
const LSREGISTER = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const BUNDLE_ID = "dev.runyard.spike.k3";
const SCHEME = "runyard-k3";

const S = new Session();
const R = { startedAt: new Date().toISOString(), ci: CI, steps: {} };
const out = path.join(S.root, "out");
const cacheDir = path.join(S.root, "eb-cache");
const openedPaths = new Set(); // 用 open 打开过的 .app 路径：最后要从 LaunchServices 里注销
const mounted = new Set();
const INST = path.join(S.root, "应用 Apps", "RunyardK3.app"); // “安装位置”：故意带空格和中文
const URL_INST = path.join(k3Root, `.k3-install-${S.tag}`, "RunyardK3.app"); // 只给链接协议实验用，见 url 一步
const exeOf = (app) => path.join(app, "Contents", "MacOS", "RunyardK3");
const shimOf = (app) => path.join(app, "Contents", "Resources", "bin", "runyard");
const cliOf = (app) => path.join(app, "Contents", "Resources", "runtime", "runyard-cli.mjs");
const cleanEnv = (extra = {}) => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { ...env, ...extra };
};

// ---------- 小工具 ----------

function lsappinfoType(pid) {
  const r = sh("lsappinfo", ["list"]);
  if (r.code !== 0) return `lsappinfo-failed:${r.code}`;
  // 每个应用一段，里面有 pid = N 和 type="Foreground" 之类
  for (const block of r.stdout.split(/\n(?=\s*\d+\) )/)) {
    if (new RegExp(`pid = ${pid}\\b`).test(block)) return /type="([^"]+)"/.exec(block)?.[1] ?? "listed";
  }
  return null;
}
const frontApp = () => sh("lsappinfo", ["info", "-only", "name", sh("lsappinfo", ["front"]).stdout.trim()]).stdout.trim();
const childrenOf = (pid) => sh("pgrep", ["-P", String(pid)]).stdout.split("\n").filter(Boolean).map(Number);
const urlHandler = () =>
  sh("osascript", ["-l", "JavaScript", "-e", `ObjC.import("AppKit"); var u = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("${SCHEME}://probe")); u.isNil() ? "none" : u.path.js`]).stdout.trim();

function signInfo(app) {
  const dv = sh("codesign", ["-dv", "--verbose=2", app]);
  const verify = sh("codesign", ["--verify", "--deep", "--strict", "--verbose=1", app]);
  const fw = sh("codesign", ["--verify", "--strict", path.join(app, "Contents", "Frameworks", "Electron Framework.framework")]);
  const spctl = sh("spctl", ["-a", "-vv", "-t", "exec", app]);
  const text = dv.stderr;
  return {
    signature: /Signature=(\S+)/.exec(text)?.[1] ?? (dv.code === 0 ? "present" : "none"),
    flags: /flags=(\S+)/.exec(text)?.[1] ?? null,
    identifier: /Identifier=(\S+)/.exec(text)?.[1] ?? null,
    teamId: /TeamIdentifier=(.+)/.exec(text)?.[1] ?? null,
    sealedFiles: /Sealed Resources.*files=(\d+)/.exec(text)?.[1] ?? null,
    dvExit: dv.code,
    dvError: dv.code === 0 ? undefined : text.trim().split("\n").pop(),
    deepVerifyExit: verify.code,
    deepVerifyMessage: verify.stderr.trim().split("\n").slice(-2).join(" | ").replaceAll(S.root, "<root>"),
    frameworkVerifyExit: fw.code,
    spctlExit: spctl.code,
    spctl: spctl.stderr.trim().replaceAll(S.root, "<root>"),
    archs: sh("lipo", ["-archs", exeOf(app)]).stdout.trim(),
  };
}

// 把一份构建“装”到安装位置：整个删掉再复制（Finder 的“替换”是先挪走旧的，再放新的，文件都是新建的）
function install(src, dest = INST) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = sh("ditto", [src, dest]);
  if (r.code !== 0) throw new Error(`ditto failed: ${r.stderr}`);
}

async function openApp(app, extraArgs = []) {
  const before = S.events().length;
  // -g：不把它带到前台，不打断负责人手上的事
  const open = sh("open", ["-g", ...extraArgs, app]);
  openedPaths.add(app);
  const up = await S.waitAppUp(before, 30_000);
  return { open: { code: open.code, stderr: open.stderr.trim() }, ...up };
}

function cli(app, args, { via = "shim", env = {}, timeoutMs = 30_000 } = {}) {
  let r;
  if (via === "shim") r = sh(shimOf(app), args, { env: cleanEnv(env), timeoutMs });
  else if (via === "direct") r = sh(exeOf(app), [cliOf(app), ...args], { env: cleanEnv({ ...env, ELECTRON_RUN_AS_NODE: "1" }), timeoutMs });
  else r = sh(process.execPath, [cliOf(app), ...args], { env: cleanEnv(env), timeoutMs });
  let json = null;
  try {
    json = JSON.parse(r.stdout.trim().split("\n").pop());
  } catch {
    // 不是 JSON 的输出（比如 --version）
  }
  return { code: r.code, signal: r.signal, ms: Math.round(r.ms), stdout: r.stdout.trim().slice(0, 2000), stderr: r.stderr.trim().slice(0, 1000), json };
}

// “用户的开发服务器”的替身。脚本先复制到临时根目录里再跑：仓库在 ~/Desktop 下面，
// 由应用拉起的管理进程去读那里的文件，系统会以这个应用的名义弹“访问桌面文件夹”的授权框（第一次实跑时踩到）。
const fixture = path.join(S.root, "http-server.mjs");
fs.copyFileSync(path.join(k1Root, "fixtures", "http-server.mjs"), fixture);

async function startRun(app) {
  const port = await freePort();
  const r = cli(app, ["run", "--argv", JSON.stringify([process.execPath, fixture, String(port)]), "--port", String(port)]);
  const pid = r.json?.result?.pid;
  if (pid) S.track(pid, "run");
  return { port, pid, ok: Boolean(r.json?.ok), notice: r.json?.notice ?? null, supervisorPid: r.json?.supervisorPid, code: r.code, ms: r.ms, detail: r.json?.ok ? undefined : JSON.stringify(r.json ?? r.stderr).replaceAll(S.root, "<root>").slice(0, 400) };
}

async function stopSupervisor(app) {
  const r = cli(app, ["installer-stop", "--reason", "test-cleanup"]);
  return r.json ?? { code: r.code, stderr: r.stderr };
}

const supervisorPid = () => S.discovery()?.pid ?? null;

// 系统给我们的进程写的崩溃报告（只看这次实验开始之后、名字是 RunyardK3 的）
function crashReports(sinceMs) {
  const dir = path.join(os.homedir(), "Library", "Logs", "DiagnosticReports");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^RunyardK3[-_ ].*\.ips$/.test(f) && fs.statSync(path.join(dir, f)).mtimeMs >= sinceMs).map((f) => {
    try {
      const body = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8").split("\n").slice(1).join("\n"));
      return { file: f, pid: body.pid, exception: body.exception, termination: body.termination, procPath: String(body.procPath).replaceAll(S.root, "<root>") };
    } catch (err) {
      return { file: f, unreadable: String(err.message).slice(0, 80) };
    }
  });
}
const step = async (name, fn) => {
  if (!want(name)) return;
  log(`== ${name}`);
  const t0 = Date.now();
  try {
    R.steps[name] = { ...(await fn()), stepMs: Date.now() - t0 };
  } catch (err) {
    R.steps[name] = { error: String(err.stack ?? err), stepMs: Date.now() - t0 };
    log(`!! ${name} failed: ${err.message}`);
  }
  log(`   ${name} done in ${Date.now() - t0} ms`);
};

// ---------- 实验 ----------

const builds = {};
async function doBuild(key, opts) {
  const r = await build({ platform: "mac", arch: "arm64", targets: ["dir"], out: path.join(out, key), cacheDir, ...opts });
  const appDir = path.join(r.out, opts.arch === "x64" ? "mac" : "mac-arm64");
  builds[key] = { ...r, app: path.join(appDir, "RunyardK3.app") };
  log(`   build ${key}: ok=${r.ok} ${r.ms} ms`);
  return builds[key];
}
const signLine = (b) => b.highlights.filter((h) => /sign/i.test(h)).map((h) => h.replaceAll(S.root, "<root>").slice(0, 300));

await step("env", async () => ({
  os: sh("sw_vers", ["-productVersion"]).stdout.trim(),
  build: sh("sw_vers", ["-buildVersion"]).stdout.trim(),
  arch: process.arch,
  cpu: os.cpus()[0]?.model,
  cores: os.cpus().length,
  memGb: Math.round(os.totalmem() / 2 ** 30),
  node: process.version,
  gatekeeper: sh("spctl", ["--status"]).stdout.trim() || sh("spctl", ["--status"]).stderr.trim(),
  rosetta: sh("arch", ["-x86_64", "/usr/bin/true"]).code === 0,
  signingIdentities: sh("security", ["find-identity", "-v", "-p", "codesigning"]).stdout.trim().split("\n").pop(),
  imageVersion: process.env.ImageVersion ?? null,
  urlHandlerBefore: urlHandler(),
}));

await step("build", async () => {
  const main = await doBuild("v1", { targets: ["dir", "dmg", "zip"], version: "0.3.0", protocol: 1 });
  if (!main.ok) throw new Error(`main build failed, see ${main.logFile}\n${main.highlights.slice(-5).join("\n")}`);
  await doBuild("v2", { version: "0.3.1", protocol: 2 });
  const files = fs.readdirSync(main.out).filter((f) => /\.(dmg|zip)$/.test(f));
  const app = main.app;
  const fw = path.join(app, "Contents", "Frameworks", "Electron Framework.framework");
  return {
    mainBuildMs: main.ms,
    secondDirBuildMs: builds.v2.ms,
    artifacts: Object.fromEntries(files.map((f) => [f, mb(fs.statSync(path.join(main.out, f)).size)])),
    appMb: mb(dirSize(app)),
    breakdownMb: {
      electronFramework: mb(dirSize(fw)),
      localesInResources: mb(fs.readdirSync(path.join(app, "Contents", "Resources")).filter((n) => n.endsWith(".lproj")).reduce((a, n) => a + dirSize(path.join(app, "Contents", "Resources", n)), 0)),
      appAsar: mb(fs.statSync(path.join(app, "Contents", "Resources", "app.asar")).size),
      runtimeJs: mb(dirSize(path.join(app, "Contents", "Resources", "runtime"))),
      otherFrameworks: mb(dirSize(path.join(app, "Contents", "Frameworks")) - dirSize(fw)),
    },
    pnpm: main.highlights.filter((h) => /pnpm|node modules|identified module/.test(h)).map((h) => h.replaceAll(S.root, "<root>").slice(0, 260)),
    signLog: signLine(main),
    downloads: main.downloads,
    downloadLog: fs.readFileSync(main.logFile, "utf8").split("\n").filter((l) => /download|https?:\/\//i.test(l)).map((l) => l.trim().replaceAll(S.root, "<root>").slice(0, 300)).slice(0, 30),
    builderCache: fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).flatMap((d) => fs.readdirSync(path.join(cacheDir, d)).map((f) => `${d}/${f}`)).filter((p) => !p.endsWith(".state")) : [],
  };
});

// 签名：打包工具在各种设置下到底做了什么，产物能不能通过校验、能不能运行
await step("signing", async () => {
  const matrix = {};
  const variants = [
    ["v1", null], // 主构建：改了打包开关并让它重置 ad-hoc 签名，identity 不写
    ["fuses-none", { fuses: "none" }], // 不动打包开关，identity 不写：只看打包工具自己签不签
    ["fuses-noreset", { fuses: "strict-noreset" }], // 改了开关但不重签
    ["identity-null", { identity: "null" }],
    ["identity-adhoc", { identity: "adhoc" }],
    ["fuses-none-identity-adhoc", { fuses: "none", identity: "adhoc" }],
    ["x64", { arch: "x64" }],
  ];
  for (const [key, opts] of variants) {
    const b = opts ? await doBuild(key, opts) : builds[key];
    if (!b.ok) {
      matrix[key] = { buildOk: false, tail: b.highlights.slice(-4) };
      continue;
    }
    const before = signInfo(b.app);
    // 能不能运行：直接执行里面的可执行文件（当作 Node），没有有效签名的 arm64 程序会被内核杀掉
    const run = sh(exeOf(b.app), ["-e", "console.log(process.arch, process.versions.electron)"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), timeoutMs: 60_000 });
    const entry = { buildOk: true, buildMs: b.ms, signLog: signLine(b), afterBuild: before, runAsNode: { code: run.code, signal: run.signal, stdout: run.stdout.trim(), stderr: run.stderr.trim().slice(0, 300) } };
    matrix[key] = entry;
    if (!opts) continue; // 主构建后面还要用，保持打包工具产出的原样
    // 设计 §8.2 的做法：打包后自己再签一遍并校验
    const manual = sh("codesign", ["--force", "--deep", "--sign", "-", b.app]);
    entry.afterManualAdhoc = { codesignExit: manual.code, stderr: manual.stderr.trim().slice(-200).replaceAll(S.root, "<root>"), ...signInfo(b.app) };
    const rerun = sh(exeOf(b.app), ["-e", "console.log(process.arch)"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), timeoutMs: 60_000 });
    entry.runAfterManual = { code: rerun.code, signal: rerun.signal, stdout: rerun.stdout.trim() };
    matrix[key] = entry;
  }
  return { matrix };
});

// 安装包：dmg 和 zip 里的应用是不是完整的、签名还在不在
await step("packages", async () => {
  const dir = builds.v1.out;
  const dmg = fs.readdirSync(dir).find((f) => f.endsWith(".dmg"));
  const zip = fs.readdirSync(dir).find((f) => f.endsWith(".zip"));
  const res = {};
  const mnt = path.join(S.root, "mnt");
  fs.mkdirSync(mnt);
  const att = sh("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mnt, path.join(dir, dmg)]);
  if (att.code === 0) {
    mounted.add(mnt);
    res.dmg = { attachMs: Math.round(att.ms), contents: fs.readdirSync(mnt), sign: signInfo(path.join(mnt, "RunyardK3.app")) };
    const det = sh("hdiutil", ["detach", mnt]);
    if (det.code === 0) mounted.delete(mnt);
    res.dmg.detachExit = det.code;
  } else res.dmg = { attachError: att.stderr.trim() };
  const unz = path.join(S.root, "unzipped");
  const ex = sh("ditto", ["-x", "-k", path.join(dir, zip), unz]);
  res.zip = { extractExit: ex.code, sign: signInfo(path.join(unz, "RunyardK3.app")) };
  // 之后的实验都用“从 zip 解出来、再放到安装位置”的那一份，最接近用户下载后的样子
  install(path.join(unz, "RunyardK3.app"));
  res.installedSign = signInfo(INST);
  const first = cli(INST, ["--version"]);
  res.firstCliRunAfterInstallMs = first.ms; // 第一次执行要过一遍系统的检查，单独记
  res.firstCliRun = first.stdout;
  return res;
});

// 隔离标记（只在 CI 上）：模拟“浏览器下载来的应用”
await step("quarantine", async () => {
  if (!CI) return { skipped: "只在 CI 上做：带隔离标记打开可能在屏幕上弹出系统对话框" };
  const res = { gatekeeper: sh("spctl", ["--status"]).stdout.trim() };
  const stamp = `0081;${Math.floor(Date.now() / 1000).toString(16)};Safari;${sh("uuidgen").stdout.trim()}`;
  res.setExit = sh("xattr", ["-r", "-w", "com.apple.quarantine", stamp, INST]).code;
  res.attrOnApp = sh("xattr", ["-p", "com.apple.quarantine", INST]).stdout.trim();
  res.spctl = sh("spctl", ["-a", "-vv", "-t", "exec", INST]).stderr.trim().replaceAll(S.root, "<root>");
  // 1) 命令行入口：不经过 LaunchServices，直接执行里面的可执行文件
  const c = cli(INST, ["--version"], { timeoutMs: 60_000 });
  res.cliWhileQuarantined = { code: c.code, signal: c.signal, ms: c.ms, stdout: c.stdout, stderr: c.stderr.slice(0, 300) };
  // 2) 像双击一样打开
  const before = S.events().length;
  const o = sh("open", ["-g", INST], { timeoutMs: 60_000 });
  openedPaths.add(INST);
  const booted = await waitFor(() => S.events().slice(before).find((e) => e.event === "boot"), 25_000);
  res.openWhileQuarantined = { exit: o.code, stderr: o.stderr.trim().replaceAll(S.root, "<root>"), ms: Math.round(o.ms), appStarted: Boolean(booted) };
  res.attrAfterOpen = sh("xattr", ["-p", "com.apple.quarantine", INST]).stdout.trim();
  res.dialogProcess = sh("pgrep", ["-lf", "CoreServicesUIAgent"]).stdout.trim().split("\n").slice(0, 3);
  res.systemLog = sh("log", ["show", "--last", "90s", "--style", "compact", "--predicate", 'process == "syspolicyd" OR process == "CoreServicesUIAgent" OR sender == "Security"'], { timeoutMs: 60_000 })
    .stdout.split("\n")
    .filter((l) => /RunyardK3|runyard|Gatekeeper|quarantine|notariz|assess/i.test(l))
    .slice(-25)
    .map((l) => l.replaceAll(S.root, "<root>").slice(0, 400));
  if (booted) {
    S.track(booted.pid, "app(quarantined)");
    await waitFor(() => S.events().find((e) => e.pid === booted.pid && e.event === "up"), 20_000);
    res.quitQuarantined = await S.quitApp(booted.pid);
    await stopSupervisor(INST);
  }
  // 3) 清掉隔离标记再打开（通过标准）
  res.clearExit = sh("xattr", ["-dr", "com.apple.quarantine", INST]).code;
  res.attrAfterClear = sh("xattr", ["-p", "com.apple.quarantine", INST]).stderr.trim().replaceAll(S.root, "<root>");
  const a = await openApp(INST);
  res.openAfterClear = { openExit: a.open.code, started: a.started, up: a.up };
  if (a.started) {
    res.quit = await S.quitApp(a.pid);
    await stopSupervisor(INST);
  }
  // dmg 也带上隔离标记：挂载后里面的应用有没有标记
  const dmgPath = path.join(builds.v1.out, fs.readdirSync(builds.v1.out).find((f) => f.endsWith(".dmg")));
  sh("xattr", ["-w", "com.apple.quarantine", stamp, dmgPath]);
  const mnt = path.join(S.root, "mnt-q");
  fs.mkdirSync(mnt);
  const att = sh("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mnt, dmgPath]);
  if (att.code === 0) {
    mounted.add(mnt);
    res.dmgQuarantine = { attrOnMountedApp: sh("xattr", ["-p", "com.apple.quarantine", path.join(mnt, "RunyardK3.app")]).stdout.trim() || "(无)" };
    if (sh("hdiutil", ["detach", mnt]).code === 0) mounted.delete(mnt);
  } else res.dmgQuarantine = { attachError: att.stderr.trim().slice(0, 300) };
  sh("xattr", ["-d", "com.apple.quarantine", dmgPath]);
  return res;
});

// 打开应用；管理进程由打包后的应用用自己的运行时拉起；应用退出后它还在；单实例
await step("launch", async () => {
  const res = {};
  const a = await openApp(INST);
  if (!a.up) throw new Error(`app did not come up: ${JSON.stringify(a).slice(0, 800)}`);
  const ev = (name) => a.events.find((e) => e.event === name);
  res.open = a.open;
  res.versions = a.boot.versions;
  res.isPackaged = a.boot.isPackaged;
  res.execPath = a.boot.execPath.replaceAll(S.root, "<root>");
  res.window = { shown: Boolean(ev("window-shown")), title: ev("window-shown")?.title };
  res.bundledDeps = { ok: ev("window-shown")?.deps?.ok, readdirp: ev("window-shown")?.deps?.readdirp?.replaceAll(S.root, "<root>") };
  const sup = ev("supervisor");
  res.supervisor = { started: sup.started, ms: sup.ms, launcher: sup.info.launcher, execPath: sup.info.execPath.replaceAll(S.root, "<root>"), versions: sup.info.versions, rssMb: mb(sup.info.rss) };
  const supPid = S.track(sup.welcome.pid, "supervisor");
  res.appLsType = lsappinfoType(a.pid);
  // 管理进程：头 3 秒每 100 毫秒看一次有没有登记到 LaunchServices（登记了才可能有 Dock 图标）
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    seen.add(String(lsappinfoType(supPid)));
    await sleep(100);
  }
  res.supervisorLsTypes = [...seen];
  res.supervisorChildren = childrenOf(supPid).length;
  res.supervisorPpid = Number(sh("ps", ["-o", "ppid=", "-p", String(supPid)]).stdout.trim());
  // 包里的命令行连上同一个管理进程
  const st = cli(INST, ["status"]);
  res.cliStatus = { code: st.code, samePid: st.json?.supervisor?.pid === supPid, cliVersion: st.json?.cli };
  const run = await startRun(INST);
  res.cliRun = { ok: run.ok, portOpen: await portOpen(run.port), ms: run.ms, detail: run.detail };
  // 正常退出应用
  const instance = sup.welcome.instanceId;
  res.quit = await S.quitApp(a.pid);
  await sleep(1500);
  res.afterQuit = { supervisorAlive: alive(supPid), runAlive: alive(run.pid), portOpen: await portOpen(run.port), sameInstance: cli(INST, ["ensure"]).json?.instanceId === instance };
  // 单实例：应用和 4 个命令行同时“连不上就启动”，先把管理进程强杀掉，留下残留的 socket 文件
  const rounds = [];
  for (let i = 0; i < 5; i++) {
    cli(INST, ["run.stopAll"]);
    const old = supervisorPid();
    S.track(old, "supervisor");
    S.killTracked(old);
    await waitFor(() => !alive(old), 5_000);
    const before = S.events().length;
    const listeningBefore = startsListening().length;
    sh("open", ["-g", INST]);
    const clis = await Promise.all([0, 1, 2, 3].map(() => cliAsync(INST, ["ensure"])));
    const up = await S.waitAppUp(before, 30_000);
    const appInstance = up.events?.find((e) => e.event === "supervisor")?.welcome.instanceId;
    const ids = new Set([appInstance, ...clis.map((c) => c.json?.instanceId)]);
    S.track(supervisorPid(), "supervisor");
    rounds.push({ distinctInstances: ids.size, newListeners: startsListening().length - listeningBefore, cliFailures: clis.filter((c) => !c.json?.ok).length, appUp: up.up });
    if (up.pid) await S.quitApp(up.pid);
  }
  res.singleInstanceRounds = rounds;
  res.singleInstanceViolations = rounds.filter((r) => r.distinctInstances !== 1 || r.newListeners !== 1).length;
  res.stop = await stopSupervisor(INST);
  return res;
});

function startsListening() {
  try {
    return fs.readFileSync(path.join(S.stateDir, "logs", "starts.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.phase === "listening");
  } catch {
    return [];
  }
}

function cliAsync(app, args) {
  return new Promise((resolve) => {
    const child = spawn(shimOf(app), args, { env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.on("close", (code) => {
      let json = null;
      try {
        json = JSON.parse(stdout.trim().split("\n").pop());
      } catch {
        // 留空
      }
      resolve({ code, json });
    });
  });
}

// 对照：打包开关全开（strict）时，界面还能不能用 file:// 从 asar 里加载
await step("fileProtocol", async () => {
  const cfgFile = path.join(S.root, "app-config.json");
  const original = fs.readFileSync(cfgFile, "utf8");
  const res = {};
  fs.writeFileSync(cfgFile, JSON.stringify({ ...JSON.parse(original), loadVia: "file" }));
  try {
    const a = await openApp(INST);
    res.strictFuses = { up: a.up, end: a.end, detail: a.events?.find((e) => e.event === "failed")?.detail.replaceAll(S.root, "<root>").slice(0, 260) };
    if (a.pid) await S.quitApp(a.pid);
    const b = await doBuild("strict-filepriv", { fuses: "strict-filepriv" });
    const c = await openApp(b.app);
    res.withGrantFileProtocolExtraPrivileges = { up: c.up, end: c.end, loadVia: c.events?.find((e) => e.event === "window-shown")?.loadVia };
    if (c.pid) await S.quitApp(c.pid);
    res.stop = await stopSupervisor(INST);
  } finally {
    fs.writeFileSync(cfgFile, original);
  }
  return res;
});

// 用应用自带的运行时跑命令行：有没有 Dock 图标、抢不抢焦点、有没有多出 Helper 进程；启动要多久
await step("cli", async () => {
  const res = {};
  await cliAsync(INST, ["ensure"]); // 先让管理进程在
  S.track(supervisorPid(), "supervisor");
  // 1) 一个活 3 秒的命令行进程，期间每 100 毫秒看一次
  const frontBefore = frontApp();
  const child = spawn(shimOf(INST), ["ensure", "--hold"], { env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  S.track(child.pid, "cli(hold)");
  const seen = new Set();
  const kids = new Set();
  const fronts = new Set();
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    seen.add(String(lsappinfoType(child.pid)));
    for (const k of childrenOf(child.pid)) kids.add(k);
    fronts.add(frontApp());
  }
  res.hold = {
    command: sh("ps", ["-o", "comm=", "-p", String(child.pid)]).stdout.trim().replaceAll(S.root, "<root>"),
    lsTypesSeen: [...seen],
    childProcesses: kids.size,
    frontAppBefore: frontBefore,
    frontAppsDuring: [...fronts],
  };
  child.stdin.end();
  await waitFor(() => !alive(child.pid), 5_000);
  res.hold.noDockIcon = seen.size === 1 && seen.has("null");
  res.hold.focusUnchanged = fronts.size === 1 && fronts.has(frontBefore);

  // 2) PATH 上的符号链接 + 最小环境
  const bin = path.join(S.root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(shimOf(INST), path.join(bin, "runyard"));
  fs.mkdirSync(path.join(bin, "rel"), { recursive: true });
  fs.symlinkSync(path.relative(path.join(bin, "rel"), shimOf(INST)), path.join(bin, "rel", "runyard"));
  // 最小环境里没有 TMPDIR，指针文件的位置要明说（这是实验自己的东西，正式版用固定的 ~/.runyard）
  const minimal = { PATH: `${bin}:/usr/bin:/bin`, HOME: path.join(S.root, "home"), K3_POINTER: S.pointer };
  const viaPath = (shell, shellArgs, script, env = minimal) => {
    const r = sh("/usr/bin/env", ["-i", ...Object.entries(env).map(([k, v]) => `${k}=${v}`), shell, ...shellArgs, script]);
    return { code: r.code, stdout: r.stdout.trim().replaceAll(S.root, "<root>").slice(0, 600), stderr: r.stderr.trim().slice(0, 300) };
  };
  res.pathLink = {
    sh: viaPath("/bin/sh", ["-c"], 'command -v runyard && runyard --version && runyard echo-args "a b" "中文 参数" \'q"uote\' && runyard status >/dev/null; echo "status-exit=$?"; runyard exit-with 7; echo "exit=$?"'),
    zsh: viaPath("/bin/zsh", ["-f", "-c"], 'command -v runyard && runyard --version; runyard exit-with 9; echo "exit=$?"'),
    bash: viaPath("/bin/bash", ["--noprofile", "--norc", "-c"], "runyard --version; echo exit=$?"),
    relativeLink: viaPath("/bin/sh", ["-c"], "runyard --version; echo exit=$?", { ...minimal, PATH: `${path.join(bin, "rel")}:/usr/bin:/bin` }),
  };

  // 3) 启动耗时。几种写法轮流跑，谁也不占“系统刚好空闲”的便宜
  const variants = {
    "node24:--version": () => sh(process.execPath, [cliOf(INST), "--version"], { env: cleanEnv(), stdio: "ignore" }),
    "app-runtime-direct:--version": () => sh(exeOf(INST), [cliOf(INST), "--version"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), stdio: "ignore" }),
    "app-runtime-shim:--version": () => sh(shimOf(INST), ["--version"], { env: cleanEnv(), stdio: "ignore" }),
    "app-runtime-path-symlink:--version": () => sh(path.join(bin, "runyard"), ["--version"], { env: minimal, stdio: "ignore" }),
    "node24:status": () => sh(process.execPath, [cliOf(INST), "status"], { env: cleanEnv(), stdio: "ignore" }),
    "app-runtime-direct:status": () => sh(exeOf(INST), [cliOf(INST), "status"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), stdio: "ignore" }),
    "app-runtime-shim:status": () => sh(shimOf(INST), ["status"], { env: cleanEnv(), stdio: "ignore" }),
    "baseline:/bin/sh -c :": () => sh("/bin/sh", ["-c", ":"], { stdio: "ignore" }),
  };
  const samples = Object.fromEntries(Object.keys(variants).map((k) => [k, []]));
  const failures = {};
  for (const [k, fn] of Object.entries(variants)) fn(); // 热身一轮，不计
  const frontBeforeLoop = frontApp();
  for (let i = 0; i < RUNS; i++) {
    for (const [k, fn] of Object.entries(variants)) {
      const r = fn();
      if (r.code !== 0) failures[k] = (failures[k] ?? 0) + 1;
      samples[k].push(r.ms);
    }
  }
  res.timing = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, stats(v)]));
  res.timingFailures = failures;
  res.frontAppUnchangedAcrossLoop = frontApp() === frontBeforeLoop;
  res.runsPerVariant = RUNS;
  res.stop = await stopSupervisor(INST);
  return res;
});

// 链接协议 runyard-k3://
await step("url", async () => {
  const res = {};
  const flagsOf = () => sh(LSREGISTER, ["-dump"], { timeoutMs: 60_000 }).stdout.split("\n").filter((l) => l.includes(S.tag) || /^bundle flags:/.test(l)).reduce((acc, l, i, all) => (l.includes(S.tag) && /^path:/.test(l) ? [...acc, { path: l.replace(/^path:\s*/, "").replace(/ \(0x[0-9a-f]+\)$/, "").replaceAll(S.root, "<root>"), flags: all.slice(i + 1).find((x) => /^bundle flags:/.test(x))?.replace(/^bundle flags:\s*/, "") }] : acc), []);
  // 1) 应用在临时目录里：系统登记了它，但不拿它当链接的处理程序
  let a = await openApp(INST);
  res.inTempDir = { handler: urlHandler().replaceAll(S.root, "<root>"), launchServicesRecord: flagsOf().slice(0, 3) };
  const o0 = sh("open", ["-g", `${SCHEME}://open/from-temp`]);
  res.inTempDir.open = { exit: o0.code, stderr: o0.stderr.trim().slice(0, 160) };
  await S.quitApp(a.pid);
  await stopSupervisor(INST);
  sh(LSREGISTER, ["-u", INST]);
  // 2) 放到一个不是临时目录的位置（仓库检出目录下的一个临时文件夹，用完即删；不放 /Applications）
  fs.mkdirSync(path.dirname(URL_INST), { recursive: true });
  sh("ditto", [INST, URL_INST]);
  a = await openApp(URL_INST);
  res.handlerAfterOpen = urlHandler().replace(k3Root, "<spikes/k3>");
  res.launchServicesRecord = flagsOf().concat(sh(LSREGISTER, ["-dump"], { timeoutMs: 60_000 }).stdout.split("\n").filter((l) => l.includes(".k3-install-")).slice(0, 1).map((l) => ({ line: l.trim().replace(k3Root, "<spikes/k3>") })));
  // 应用在运行时
  let before = S.events().length;
  const o1 = sh("open", ["-g", `${SCHEME}://open/demo-a?x=1`]);
  const got1 = await waitFor(() => S.events().slice(before).find((e) => e.event === "open-url"), 10_000);
  res.whileRunning = { openExit: o1.code, stderr: o1.stderr.trim(), delivered: got1?.url ?? null, toSamePid: got1?.pid === a.pid };
  await S.quitApp(a.pid);
  // 应用没在运行时
  before = S.events().length;
  const o2 = sh("open", ["-g", `${SCHEME}://open/demo-b`]);
  const up = await S.waitAppUp(before, 30_000);
  const got2 = up.events?.find((e) => e.event === "open-url");
  res.whileNotRunning = { openExit: o2.code, stderr: o2.stderr.trim(), appStarted: up.started, delivered: got2?.url ?? null, beforeReady: got2 ? !got2.ready : null, urlsInArgv: up.boot?.urlsInArgv };
  if (up.pid) await S.quitApp(up.pid);
  res.stop = await stopSupervisor(URL_INST);
  // 用完立刻注销并删除，不留处理程序
  res.unregisterExit = sh(LSREGISTER, ["-u", URL_INST]).code;
  openedPaths.delete(URL_INST);
  fs.rmSync(path.dirname(URL_INST), { recursive: true, force: true });
  res.handlerAfterCleanup = urlHandler();
  return res;
});

// 系统通知（只在 CI 上：负责人的 Mac 上会弹权限请求）
await step("notification", async () => {
  if (!CI) return { skipped: "只在 CI 上做：可能弹出通知权限请求" };
  const a = await openApp(INST);
  const reply = await S.control("notify", { pid: a.pid }, 15_000);
  const res = { reply, signature: signInfo(INST).signature };
  res.systemLog = sh("log", ["show", "--last", "30s", "--style", "compact", "--predicate", 'process == "RunyardK3" OR process == "usernoted"'], { timeoutMs: 60_000 })
    .stdout.split("\n")
    .filter((l) => /notif|UNError|usernoted|RunyardK3/i.test(l))
    .slice(-12)
    .map((l) => l.replaceAll(S.root, "<root>").slice(0, 300));
  await S.quitApp(a.pid);
  await stopSupervisor(INST);
  return res;
});

// 管理进程还活着时替换 .app
await step("replace", async () => {
  const res = {};
  const trash = path.join(S.root, "trash");
  fs.mkdirSync(trash, { recursive: true });
  const supEvent = (a) => a.events?.find((e) => e.event === "supervisor");
  const brief = (a) => {
    const s = supEvent(a);
    return s ? { started: s.started, notice: s.notice, pid: s.welcome.pid, protocol: s.welcome.protocol, execCheck: s.execCheck, execPath: s.info.execPath.replaceAll(S.root, "<root>") } : { failed: a.events?.find((e) => e.event === "supervisor-failed")?.code ?? "no-event" };
  };

  // A：v1 → v2（协议版本升了），替换时有一个命令行持有的运行
  {
    const r = {};
    const tA = Date.now();
    install(builds.v1.app);
    let a = await openApp(INST);
    const s1 = S.track(supEvent(a).welcome.pid, "supervisor");
    const run1 = await startRun(INST);
    await S.quitApp(a.pid);
    fs.renameSync(INST, path.join(trash, "old-A.app")); // 像 Finder 那样：旧的挪走，新的放进来
    sh("ditto", [builds.v2.app, INST]);
    r.afterSwap = { oldSupervisorAlive: alive(s1), runAlive: alive(run1.pid), discoveryExecExists: fs.existsSync(S.discovery().execPath), supervisorBinaryNow: sh("ps", ["-o", "comm=", "-p", String(s1)]).stdout.trim().replaceAll(S.root, "<root>") };
    fs.rmSync(path.join(trash, "old-A.app"), { recursive: true, force: true }); // 清空废纸篓：旧文件彻底没了
    await sleep(500);
    const st = cli(INST, ["status"]);
    r.afterOldDeleted = { oldSupervisorAlive: alive(s1), statusOk: st.json?.running === true, supervisorProtocol: st.json?.supervisor?.protocol, cliProtocol: st.json?.cli?.protocol };
    if (!alive(s1)) {
      // 旧的管理进程没了：留下它最后说的话和系统的崩溃报告，看是谁结束了它
      await sleep(3000);
      r.afterOldDeleted.lastLogLines = S.supervisorLog().filter((e) => e.pid === s1).slice(-3).map((e) => `${e.event}${e.reason ? `:${e.reason}` : ""}${e.message ? `:${e.message}` : ""}`);
      r.afterOldDeleted.crashReports = crashReports(tA).filter((c) => c.pid === s1);
      r.afterOldDeleted.run1StillAlive = alive(run1.pid);
    }
    const run2 = await startRun(INST); // 新版命令行经旧管理进程再起一个运行：旧进程还能不能起子进程
    r.newRunViaOldSupervisor = { ok: run2.ok, notice: run2.notice, portOpen: run2.ok ? await portOpen(run2.port) : false, detail: run2.detail };
    a = await openApp(INST);
    r.newAppWithRuns = brief(a);
    r.newAppWithRuns.sameOldSupervisor = r.newAppWithRuns.pid === s1;
    cli(INST, ["run.stopAll"]);
    await S.quitApp(a.pid);
    a = await openApp(INST); // 没有运行了：这次应该换新
    r.newAppIdle = brief(a);
    r.newAppIdle.oldSupervisorGone = !alive(s1);
    S.track(r.newAppIdle.pid, "supervisor");
    await S.quitApp(a.pid);
    await stopSupervisor(INST);
    res.A_protocolBump = r;
  }

  // B：同一个协议版本的另一份构建（文件全是新的），管理进程空闲
  {
    const r = {};
    install(builds.v1.app);
    let a = await openApp(INST);
    const s1 = S.track(supEvent(a).welcome.pid, "supervisor");
    await S.quitApp(a.pid);
    fs.renameSync(INST, path.join(trash, "old-B.app"));
    sh("ditto", [builds.v1.app, INST]);
    fs.rmSync(path.join(trash, "old-B.app"), { recursive: true, force: true });
    a = await openApp(INST);
    r.afterReplace = brief(a);
    r.oldSupervisorKept = r.afterReplace.pid === s1 && alive(s1);
    await S.quitApp(a.pid);
    await stopSupervisor(INST);
    res.B_sameProtocol = r;
  }

  // C：不挪走旧的，直接往上覆盖（ditto 到已有的 .app 上）
  {
    const r = {};
    install(builds.v1.app);
    let a = await openApp(INST);
    const s1 = S.track(supEvent(a).welcome.pid, "supervisor");
    await S.quitApp(a.pid);
    const d = sh("ditto", [builds.v2.app, INST]);
    await sleep(1000);
    const st = cli(INST, ["status"]);
    r.overwrite = { dittoExit: d.code, oldSupervisorAlive: alive(s1), statusOk: st.json?.running === true, sign: signInfo(INST).deepVerifyExit };
    a = await openApp(INST);
    r.newApp = brief(a);
    r.newApp.oldSupervisorGone = !alive(s1);
    S.track(r.newApp.pid, "supervisor");
    await S.quitApp(a.pid);
    await stopSupervisor(INST);
    res.C_overwriteInPlace = r;
  }

  // D：应用被挪到别处（发现文件里记的路径不存在了）。先空闲，再带一个运行
  {
    const r = {};
    const moved = path.join(S.root, "应用 Apps", "Moved", "RunyardK3.app");
    install(builds.v1.app);
    let a = await openApp(INST);
    const s1 = S.track(supEvent(a).welcome.pid, "supervisor");
    await S.quitApp(a.pid);
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.renameSync(INST, moved);
    a = await openApp(moved);
    r.idle = brief(a);
    r.idle.oldSupervisorGone = !alive(s1);
    const s2 = S.track(r.idle.pid, "supervisor");
    const run = await startRun(moved);
    await S.quitApp(a.pid);
    sh(LSREGISTER, ["-u", moved]); // 这个路径马上就不存在了，先从 LaunchServices 里注销
    openedPaths.delete(moved);
    fs.renameSync(moved, INST); // 再挪回去：这次有运行
    a = await openApp(INST);
    r.withRun = brief(a);
    r.withRun.sameSupervisor = r.withRun.pid === s2;
    r.withRun.runAlive = alive(run.pid);
    await S.quitApp(a.pid);
    await stopSupervisor(INST);
    res.D_moved = r;
  }
  return res;
});

// 对照：把 runAsNode 关掉会坏什么
await step("runAsNodeOff", async () => {
  if (!CI) return { skipped: "只在 CI 上做：直接执行会把一个完整的应用带到前台约 20 秒" };
  const b = await doBuild("norunasnode", { fuses: "norunasnode" });
  if (!b.ok) return { buildOk: false, tail: b.highlights.slice(-4) };
  const res = { buildOk: true };
  const before = S.events().length;
  // 想当命令行用：结果是整个应用被启动了（环境变量被无视）
  const child = spawn(exeOf(b.app), [cliOf(b.app), "--version"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), stdio: ["ignore", "pipe", "pipe"] });
  S.track(child.pid, "app(norunasnode)");
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d));
  const boot = await waitFor(() => S.events().slice(before).find((e) => e.event === "boot"), 15_000);
  res.cliAttempt = { printedVersion: stdout.includes("runyard 0.3.0"), startedAsFullApp: Boolean(boot), argvTail: boot?.argv.slice(1).map((x) => path.basename(x)) };
  // 这个应用自己去拉管理进程：拉起来的又是一个完整的应用实例，管理进程永远起不来
  const failed = await waitFor(() => S.events().slice(before).find((e) => e.event === "supervisor-failed" || e.event === "supervisor"), 30_000, 200);
  res.appTriesToStartSupervisor = { outcome: failed?.event ?? "timeout", code: failed?.code ?? null, secondInstancesSpawned: S.events().slice(before).filter((e) => e.event === "second-instance-exit").length };
  await S.quitApp(child.pid);
  await waitFor(() => !alive(child.pid), 5_000);
  S.killTracked(child.pid);
  res.leftover = sh("pgrep", ["-f", b.app]).stdout.trim();
  return res;
});

// ---------- 收尾 ----------

log("== cleanup");
const cleanup = { stopSupervisor: fs.existsSync(INST) ? await stopSupervisor(INST) : null };
for (const e of S.events().filter((x) => x.event === "boot")) if (alive(e.pid)) await S.quitApp(S.track(e.pid, "app"));
for (const m of mounted) sh("hdiutil", ["detach", "-force", m]);
if (fs.existsSync(URL_INST)) sh(LSREGISTER, ["-u", URL_INST]);
fs.rmSync(path.dirname(URL_INST), { recursive: true, force: true });
cleanup.urlInstallDirExists = fs.existsSync(path.dirname(URL_INST));
// 从 LaunchServices 里注销我们打开过的每一个路径（趁文件还在），免得留下 runyard-k3:// 的处理程序
cleanup.lsUnregister = [...openedPaths, ...Object.values(builds).map((b) => b.app)].filter((p) => fs.existsSync(p)).map((p) => ({ path: p.replaceAll(S.root, "<root>"), exit: sh(LSREGISTER, ["-u", p]).code }));
const tag = S.tag;
const rootPath = S.root;
if (argv.includes("--keep")) {
  // 调试用：留着临时根目录（进程照样清掉），指针文件删掉
  for (const pid of S.tracked.keys()) S.killTracked(pid);
  fs.rmSync(S.pointer, { force: true });
  log(`kept ${S.root}`);
  cleanup.session = { kept: S.root };
} else cleanup.session = S.cleanup();
await sleep(500);
cleanup.urlHandlerAfter = urlHandler();
cleanup.lsDumpMentions = sh(LSREGISTER, ["-dump"], { timeoutMs: 60_000 }).stdout.split("\n").filter((l) => l.includes(SCHEME) || l.includes(tag)).length;
// 应用可能在用户目录里留下的东西：逐个看，有就删（只删这个实验应用自己的、名字完全对得上的）
const home = os.homedir();
const residuePaths = [
  `Library/Application Support/RunyardK3`,
  `Library/Application Support/runyard-spike-k3`,
  `Library/Preferences/${BUNDLE_ID}.plist`,
  `Library/Saved Application State/${BUNDLE_ID}.savedState`,
  `Library/Caches/${BUNDLE_ID}`,
  `Library/Caches/${BUNDLE_ID}.ShipIt`,
  `Library/HTTPStorages/${BUNDLE_ID}`,
  `Library/WebKit/${BUNDLE_ID}`,
  `Library/Logs/RunyardK3`,
  `Library/Caches/electron-builder`,
].map((p) => path.join(home, p));
// 签名对照里那份“改了开关却没重签”的构建会被系统杀掉，系统为它写了一份崩溃报告：这是我们造成的，删掉
const reports = path.join(home, "Library", "Logs", "DiagnosticReports");
const sessionStart = Date.parse(R.startedAt);
cleanup.crashReportsRemoved = (fs.existsSync(reports) ? fs.readdirSync(reports) : []).filter((f) => /^RunyardK3[-_ ].*\.(ips|crash|diag)$/.test(f) && fs.statSync(path.join(reports, f)).mtimeMs >= sessionStart - 1000);
if (!argv.includes("--keep")) for (const f of cleanup.crashReportsRemoved) fs.rmSync(path.join(reports, f), { force: true });
cleanup.residueFound = residuePaths.filter((p) => fs.existsSync(p)).map((p) => p.replace(home, "~"));
sh("defaults", ["delete", BUNDLE_ID]);
// 这个实验应用可能留下的隐私授权记录（只清它自己的 bundle id）
cleanup.tccReset = sh("tccutil", ["reset", "All", BUNDLE_ID]).stdout.trim();
for (const p of residuePaths.slice(0, -1)) fs.rmSync(p, { recursive: true, force: true });
cleanup.residueAfter = residuePaths.slice(0, -1).filter((p) => fs.existsSync(p)).map((p) => p.replace(home, "~"));
cleanup.processesLeft = sh("pgrep", ["-fl", tag]).stdout.trim().split("\n").filter(Boolean);
// 按可执行文件的路径找，免得匹配到命令行里恰好带这个词的无关进程
cleanup.processesNamedRunyardK3 = sh("pgrep", ["-fl", "Contents/MacOS/RunyardK3|RunyardK3 Helper"]).stdout.trim().split("\n").filter((l) => l && !/zsh -c|pgrep/.test(l));
cleanup.rootExists = fs.existsSync(rootPath);
cleanup.realRunyardDirsTouched = { "~/.runyard": fs.existsSync(path.join(home, ".runyard")), "~/Runyard": fs.existsSync(path.join(home, "Runyard")) };
R.cleanup = cleanup;
R.finishedAt = new Date().toISOString();

const label = opt("label", CI ? "ci" : "local");
const file = writeResults(`darwin-${process.arch}-${label}.json`, R);
log(`results → ${file}`);

// 判定摘要
const s = R.steps;
const verdicts = {
  "打包成功（pnpm 目录结构）": s.build && !s.build.error && s.launch?.bundledDeps?.ok === true,
  "arm64 签名校验通过": s.signing?.matrix?.v1?.afterBuild?.deepVerifyExit === 0,
  "x64 签名校验通过": s.signing?.matrix?.x64?.afterBuild?.deepVerifyExit === 0,
  "清除隔离标记后能打开": CI ? s.quarantine?.openAfterClear?.up === true : "未验证（本机不做隔离实验；无隔离标记时能打开：" + (s.launch?.window?.shown === true) + "）",
  "管理进程由打包后的应用拉起并活过应用": s.launch?.afterQuit?.supervisorAlive === true && s.launch?.afterQuit?.sameInstance === true,
  "单实例": s.launch?.singleInstanceViolations === 0,
  "命令行没有 Dock 图标": s.cli?.hold?.noDockIcon === true,
  "命令行启动不慢于 150 ms（--version，垫片，中位数）": s.cli?.timing ? s.cli.timing["app-runtime-shim:--version"].median <= 150 : null,
  "链接生效（运行中 / 未运行）": s.url ? Boolean(s.url.whileRunning?.delivered) && Boolean(s.url.whileNotRunning?.delivered) : null,
  "替换应用后旧管理进程被换掉（协议升级、空闲）": s.replace?.A_protocolBump?.newAppIdle?.started === true && s.replace?.A_protocolBump?.newAppIdle?.oldSupervisorGone === true,
  "清理干净": cleanup.processesLeft.length === 0 && cleanup.processesNamedRunyardK3.length === 0 && !cleanup.rootExists && cleanup.urlHandlerAfter === "none" && cleanup.residueAfter.length === 0,
};
console.log("\n===== K3 macOS 判定 =====");
for (const [k, v] of Object.entries(verdicts)) console.log(`${v === true ? "通过  " : v === false ? "不通过" : "      "} ${k}${v === true || v === false ? "" : `：${v}`}`);
if (s.cli?.timing) {
  console.log("\n启动耗时（毫秒，中位数 / p95 / 最大，n=" + RUNS + "）");
  for (const [k, v] of Object.entries(s.cli.timing)) console.log(`  ${k.padEnd(40)} ${v.median} / ${v.p95} / ${v.max}`);
}
console.log(JSON.stringify({ cleanup }, null, 1));
const failedSteps = Object.entries(s).filter(([, v]) => v.error).map(([k]) => k);
if (failedSteps.length) {
  console.log(`出错的步骤：${failedSteps.join(", ")}`);
  process.exitCode = 1;
}
