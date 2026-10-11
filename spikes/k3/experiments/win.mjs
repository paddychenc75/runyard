// K3 的 Windows 实验，只在一次性的 CI 机器（windows-2025）上跑：它会真的安装、卸载、改当前用户的 PATH 和注册表。
// 用法：node experiments/win.mjs [--label 名字] [--runs 30]
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "../scripts/build.mjs";
import { alive, dirSize, freePort, k1Root, k3Root, log, mb, portOpen, Session, sh, sleep, stats, waitFor, writeResults } from "./common.mjs";

if (process.platform !== "win32") throw new Error("只在 Windows 上运行");
if (!process.env.CI) throw new Error("这个脚本会改当前用户的 PATH 和注册表，只允许在 CI 的一次性机器上运行（需要环境变量 CI）");

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const RUNS = Number(opt("runs", 30));
const S = new Session();
const R = { startedAt: new Date().toISOString(), steps: {} };
const out = path.join(S.root, "out");
const cacheDir = path.join(S.root, "eb-cache");
const HOOK_LOG = path.join(os.tmpdir(), "runyard-k3-installer-hook.log");
const fixture = path.join(S.root, "http-server.mjs");
fs.copyFileSync(path.join(k1Root, "fixtures", "http-server.mjs"), fixture);
fs.rmSync(HOOK_LOG, { force: true });

const cleanEnv = (extra = {}) => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return { ...env, ...extra };
};
const ps = (script, opts = {}) => sh("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], opts);
const psJson = (script) => {
  const r = ps(`${script} | ConvertTo-Json -Depth 6 -Compress`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { parseError: r.stdout.slice(0, 300), stderr: r.stderr.slice(0, 300) };
  }
};
// 结果一定是数组（PowerShell 的管道会把只有一个元素的数组拆开、把空数组变成没有输出）
const psJsonArr = (script) => {
  const r = ps(`ConvertTo-Json -Compress -InputObject @(${script})`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return [`parse-error: ${r.stdout.slice(0, 200)} ${r.stderr.slice(0, 200)}`];
  }
};
const step = async (name, fn) => {
  log(`== ${name}`);
  const t0 = Date.now();
  try {
    R.steps[name] = { ...(await fn()), stepMs: Date.now() - t0 };
  } catch (err) {
    R.steps[name] = { error: String(err.stack ?? err), stepMs: Date.now() - t0 };
    log(`!! ${name} failed: ${err.message}`);
  }
  log(`   ${name} done in ${Date.now() - t0} ms: ${JSON.stringify(R.steps[name]).slice(0, 1500)}`);
};

// ---------- 系统状态的快照：安装前、卸载后各拍一次，逐项比 ----------
function snapshot() {
  return psJson(`
$env_key = Get-Item 'HKCU:\\Environment'
$un = Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like 'RunyardK3*' }
$cmd = (Get-ItemProperty 'HKCU:\\Software\\Classes\\runyard-k3\\shell\\open\\command' -ErrorAction SilentlyContinue).'(default)'
[ordered]@{
  userPath = [string]$env_key.GetValue('Path', '<absent>', 'DoNotExpandEnvironmentNames')
  userPathKind = if ($env_key.GetValueNames() -contains 'Path') { [string]$env_key.GetValueKind('Path') } else { '<absent>' }
  urlKey = Test-Path 'HKCU:\\Software\\Classes\\runyard-k3'
  urlCommand = [string]$cmd
  uninstall = @($un | ForEach-Object { [ordered]@{ key = $_.PSChildName; version = $_.DisplayVersion; location = $_.InstallLocation; uninstallString = $_.UninstallString; publisher = $_.Publisher } })
  softwareGuidKeys = @(Get-ChildItem 'HKCU:\\Software' | Where-Object { $_.PSChildName -match '^[0-9a-f]{8}-[0-9a-f]{4}-' } | ForEach-Object { $_.PSChildName })
  programsDir = @(Get-ChildItem "$env:LOCALAPPDATA\\Programs" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
  startMenu = @(Get-ChildItem "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs" -Recurse -Filter '*Runyard*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  desktop = @(Get-ChildItem ([Environment]::GetFolderPath('Desktop')) -Filter '*Runyard*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
  appData = @(Get-ChildItem $env:APPDATA, $env:LOCALAPPDATA -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'runyard' } | ForEach-Object { $_.FullName })
}`);
}
const installInfo = () => snapshot().uninstall?.[0] ?? null;
const readHookLog = () => {
  try {
    return fs.readFileSync(HOOK_LOG, "utf8");
  } catch {
    return "";
  }
};
let hookSeen = 0;
const newHookLines = () => {
  const lines = readHookLog().split(/\r?\n/).filter(Boolean);
  const fresh = lines.slice(hookSeen);
  hookSeen = lines.length;
  return fresh.map((l) => l.replaceAll(S.root, "<root>").slice(0, 600));
};

// ---------- 安装、卸载、应用、命令行 ----------
let INSTALL_DIR = null;
const exe = () => path.join(INSTALL_DIR, "RunyardK3.exe");
const cliJs = () => path.join(INSTALL_DIR, "resources", "runtime", "runyard-cli.mjs");
const binDir = () => path.join(INSTALL_DIR, "bin");

function runInstaller(setup, how = "createprocess") {
  const t0 = Date.now();
  const r = spawnSync(setup, ["/S"], { windowsHide: true, timeout: 300_000 });
  const info = installInfo();
  if (info?.location) INSTALL_DIR = info.location;
  return { how, exit: r.status, signal: r.signal, ms: Date.now() - t0, installedVersion: info?.version ?? null, location: info?.location ?? null, buildInfo: readBuildInfo(), hook: newHookLines() };
}
function readBuildInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(INSTALL_DIR, "resources", "runtime", "build-info.json"), "utf8")).version;
  } catch {
    return null;
  }
}
async function runUninstaller() {
  const info = installInfo();
  if (!info) return { error: "not installed" };
  const uninst = /^"([^"]+)"/.exec(info.uninstallString)?.[1] ?? info.uninstallString;
  const t0 = Date.now();
  // NSIS 的卸载器会把自己复制到临时目录再执行，原进程马上返回，所以要自己等它做完
  const r = spawnSync(uninst, ["/S"], { windowsHide: true, timeout: 120_000 });
  const gone = await waitFor(() => !installInfo(), 120_000, 1000);
  await sleep(3000);
  return { exit: r.status, ms: Date.now() - t0, uninstallKeyGone: Boolean(gone), installDirExists: fs.existsSync(info.location), filesLeft: fs.existsSync(info.location) ? fs.readdirSync(info.location, { recursive: true }).slice(0, 12).map(String) : [], hook: newHookLines() };
}

async function startApp(args = []) {
  const before = S.events().length;
  const child = spawn(exe(), args, { detached: true, stdio: "ignore", env: cleanEnv() });
  child.unref();
  return S.waitAppUp(before, 60_000);
}
function cli(args, timeoutMs = 60_000) {
  const r = sh(exe(), [cliJs(), ...args], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), timeoutMs });
  let json = null;
  try {
    json = JSON.parse(r.stdout.trim().split("\n").pop());
  } catch {
    // 不是 JSON
  }
  return { code: r.code, ms: Math.round(r.ms), stdout: r.stdout.trim().slice(0, 1500), stderr: r.stderr.trim().slice(0, 600), json };
}
async function startRun() {
  const port = await freePort();
  const r = cli(["run", "--argv", JSON.stringify([process.execPath, fixture, String(port)]), "--port", String(port)]);
  const pid = r.json?.result?.pid;
  if (pid) S.track(pid, "run");
  return { port, pid, ok: Boolean(r.json?.ok), detail: r.json?.ok ? undefined : (r.stdout || r.stderr).slice(0, 300) };
}
// 起一个“活着的管理进程 + 一个命令行持有的运行”。appRunning=false 时应用先正常退出，只留管理进程
async function liveSupervisor({ appRunning }) {
  const a = await startApp();
  if (!a.up) throw new Error(`app did not come up: ${JSON.stringify(a.events ?? a).slice(0, 600)}`);
  const sup = S.track(S.discovery().pid, "supervisor");
  const run = await startRun();
  if (!appRunning) await S.quitApp(a.pid);
  await sleep(500);
  return { appPid: a.pid, sup, run, state: { supervisorAlive: alive(sup), runAlive: alive(run.pid), portOpen: await portOpen(run.port), appAlive: alive(a.pid), runOk: run.ok, runDetail: run.detail } };
}
async function observe(live) {
  const logOf = S.supervisorLog().filter((e) => e.pid === live.sup);
  return {
    supervisorAlive: alive(live.sup),
    appAlive: alive(live.appPid),
    runAlive: alive(live.run.pid),
    runPortStillOpen: await portOpen(live.run.port),
    // 管理进程自己记下了“开始关闭”，说明它是被请走的，不是被直接结束的
    supervisorLoggedShutdown: logOf.find((e) => e.event === "shutdown-begin")?.reason ?? null,
    supervisorLoggedRunStop: logOf.some((e) => e.event === "run-stop-begin"),
    discoveryFileLeft: Boolean(S.discovery()),
    processesFromInstallDir: processesUnder(INSTALL_DIR),
  };
}
function processesUnder(dir) {
  if (!dir) return [];
  return psJsonArr(`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${dir.replaceAll("'", "''")}', 'CurrentCultureIgnoreCase') } | ForEach-Object { '{0}:{1}' -f $_.ProcessId, $_.Name }`);
}
// 对照实验留下的孤儿：只结束我们登记过的那几个
async function reap(live) {
  const killed = [];
  for (const pid of [live.run.pid, live.sup, live.appPid]) if (pid && S.killTracked(pid)) killed.push(pid);
  await sleep(500);
  fs.rmSync(path.join(S.stateDir, "run"), { recursive: true, force: true });
  return killed;
}

// ---------- 实验 ----------
const B = {};
async function doBuild(key, opts) {
  const r = await build({ platform: "win", arch: "x64", targets: ["nsis"], out: path.join(out, key), cacheDir, ...opts });
  const setup = r.ok ? fs.readdirSync(r.out).find((f) => f.endsWith("-setup.exe")) : null;
  B[key] = { ...r, setup: setup ? path.join(r.out, setup) : null, unpacked: path.join(r.out, "win-unpacked") };
  log(`   build ${key}: ok=${r.ok} ${r.ms} ms${r.ok ? "" : `\n${r.highlights.slice(-12).join("\n")}`}`);
  fs.copyFileSync(r.logFile, path.join(resultsTmp, `build-${key}.log`)); // 构建日志随结果一起上传
  return B[key];
}
const resultsTmp = path.join(k3Root, "results", "tmp");
fs.mkdirSync(resultsTmp, { recursive: true });

await step("env", async () => ({
  os: psJson("Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber"),
  imageVersion: process.env.ImageVersion ?? null,
  cpu: os.cpus()[0]?.model,
  cores: os.cpus().length,
  memGb: Math.round(os.totalmem() / 2 ** 30),
  node: process.version,
  user: os.userInfo().username,
  isAdmin: ps("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)").stdout.trim(),
  codePage: sh("cmd.exe", ["/d", "/c", "chcp"]).stdout.trim(),
  defender: psJson("Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureVersion, IsTamperProtected"),
  developerMode: ps("(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense").stdout.trim(),
}));

const before = snapshot();
R.snapshotBefore = before;

await step("build", async () => {
  const main = await doBuild("hook-0.3.0", { version: "0.3.0", protocol: 1, nsis: "hook" });
  if (!main.ok) throw new Error("main build failed");
  // 其余几份安装包直接用第一份解开的目录重新包一遍，只是 NSIS 脚本不同
  await doBuild("default-0.3.0", { version: "0.3.0", nsis: "default", prepackaged: main.unpacked });
  await doBuild("nocheck-0.3.0", { version: "0.3.0", nsis: "nocheck", prepackaged: main.unpacked });
  await doBuild("hook-0.3.1", { version: "0.3.1", protocol: 2, nsis: "hook" });
  const unpacked = main.unpacked;
  const top = fs.readdirSync(unpacked, { withFileTypes: true }).map((e) => [e.name, e.isDirectory() ? dirSize(path.join(unpacked, e.name)) : fs.statSync(path.join(unpacked, e.name)).size]).sort((a, b) => b[1] - a[1]);
  return {
    mainBuildMs: main.ms,
    prepackagedNsisOnlyMs: [B["default-0.3.0"].ms, B["nocheck-0.3.0"].ms],
    secondFullBuildMs: B["hook-0.3.1"].ms,
    allOk: Object.fromEntries(Object.entries(B).map(([k, v]) => [k, v.ok])),
    setupMb: mb(fs.statSync(main.setup).size),
    unpackedMb: mb(dirSize(unpacked)),
    biggestMb: Object.fromEntries(top.slice(0, 8).map(([n, s]) => [n, mb(s)])),
    binDir: fs.readdirSync(path.join(unpacked, "bin")),
    pnpm: main.highlights.filter((h) => /pnpm|collected node modules|identified module/.test(h)).map((h) => h.replaceAll(S.root, "<root>").slice(0, 240)).slice(0, 6),
    signLog: main.highlights.filter((h) => /sign/i.test(h)).map((h) => h.replaceAll(S.root, "<root>").slice(0, 240)).slice(0, 8),
    downloadLog: fs.readFileSync(main.logFile, "utf8").split("\n").filter((l) => /download|https?:\/\//i.test(l)).map((l) => l.trim().replaceAll(S.root, "<root>").slice(0, 260)).slice(0, 30),
    builderCache: fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).flatMap((d) => fs.readdirSync(path.join(cacheDir, d)).map((f) => `${d}/${f}`)).filter((p) => !p.endsWith(".state")) : [],
  };
});

// 未签名的安装包：文件属性、网络标记（Mark of the Web）、Defender
await step("unsigned", async () => {
  const setup = B["hook-0.3.0"].setup;
  const res = {};
  res.signature = psJson(`Get-AuthenticodeSignature '${setup}' | Select-Object @{n='Status';e={[string]$_.Status}}, StatusMessage, @{n='Signer';e={[string]$_.SignerCertificate.Subject}}`);
  res.sha256 = crypto.createHash("sha256").update(fs.readFileSync(setup)).digest("hex");
  res.versionInfo = psJson(`(Get-Item '${setup}').VersionInfo | Select-Object CompanyName, ProductName, FileVersion, LegalCopyright`);
  const mp = path.join(process.env.ProgramFiles, "Windows Defender", "MpCmdRun.exe");
  if (fs.existsSync(mp)) {
    const scan = sh(mp, ["-Scan", "-ScanType", "3", "-File", setup, "-DisableRemediation"], { timeoutMs: 300_000 });
    res.defenderScanInstaller = { exit: scan.code, ms: Math.round(scan.ms), tail: scan.stdout.trim().split(/\r?\n/).slice(-4) };
    const scan2 = sh(mp, ["-Scan", "-ScanType", "3", "-File", path.join(B["hook-0.3.0"].unpacked, "RunyardK3.exe"), "-DisableRemediation"], { timeoutMs: 300_000 });
    res.defenderScanAppExe = { exit: scan2.code, tail: scan2.stdout.trim().split(/\r?\n/).slice(-3) };
  } else res.defenderScanInstaller = { skipped: "MpCmdRun.exe not found" };
  // 给安装包加上“来自互联网”的标记，再静默运行
  const motw = path.join(S.root, "motw-setup.exe");
  fs.copyFileSync(setup, motw);
  ps(`Set-Content -LiteralPath '${motw}' -Stream Zone.Identifier -Value '[ZoneTransfer]','ZoneId=3','HostUrl=https://github.com/paddychenc75/runyard/releases/download/v0.3.0/setup.exe'`);
  res.motwStream = ps(`Get-Content -LiteralPath '${motw}' -Stream Zone.Identifier`).stdout.trim().split(/\r?\n/);
  res.installViaCreateProcess = runInstaller(motw, "CreateProcess（node spawn），带网络标记");
  res.installedExeHasMotw = ps(`(Get-Item -LiteralPath '${exe()}' -Stream Zone.Identifier -ErrorAction SilentlyContinue) -ne $null`).stdout.trim();
  // 经 ShellExecute 启动（资源管理器双击走的就是它）。没人能点对话框，所以限时 90 秒
  const t0 = Date.now();
  const se = ps(`$p = Start-Process -FilePath '${motw}' -ArgumentList '/S' -PassThru; if ($p.WaitForExit(90000)) { 'exit=' + $p.ExitCode } else { 'still-running pid=' + $p.Id; Stop-Process -Id $p.Id -Force }`, { timeoutMs: 150_000 });
  res.installViaShellExecute = { result: se.stdout.trim(), stderr: se.stderr.trim().slice(0, 300), ms: Date.now() - t0, hook: newHookLines() };
  res.smartScreenPolicy = psJson("[ordered]@{ explorer = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -ErrorAction SilentlyContinue).SmartScreenEnabled; policy = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -ErrorAction SilentlyContinue).EnableSmartScreen; sac = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy' -ErrorAction SilentlyContinue).VerifiedAndReputablePolicyState }");
  return res;
});

await step("install", async () => {
  if (!INSTALL_DIR) throw new Error("not installed");
  const snap = snapshot();
  const exeBuf = fs.readFileSync(exe());
  const pe = exeBuf.readUInt32LE(0x3c);
  return {
    location: INSTALL_DIR.replace(os.homedir(), "~"),
    perUser: INSTALL_DIR.toLowerCase().startsWith(process.env.LOCALAPPDATA.toLowerCase()),
    installedMb: mb(dirSize(INSTALL_DIR)),
    topLevel: fs.readdirSync(INSTALL_DIR).slice(0, 40),
    uninstallEntry: snap.uninstall,
    urlKeyAfterInstall: snap.urlKey,
    urlCommand: snap.urlCommand?.replace(INSTALL_DIR, "<install>"),
    userPathChangedByInstaller: snap.userPath !== before.userPath,
    shortcuts: { startMenu: snap.startMenu.map((p) => path.basename(p)), desktop: snap.desktop },
    // 可执行文件的子系统：2 = 图形界面程序（不会自己开控制台窗口），3 = 控制台程序
    exeSubsystem: exeBuf.readUInt16LE(pe + 0x5c),
    exeSignature: psJson(`Get-AuthenticodeSignature '${exe()}' | Select-Object @{n='Status';e={[string]$_.Status}}`),
  };
});

await step("app", async () => {
  const a = await startApp();
  if (!a.up) throw new Error(`app did not come up: ${JSON.stringify(a.events ?? a).slice(0, 900)}`);
  const ev = (n) => a.events.find((e) => e.event === n);
  const sup = ev("supervisor");
  S.track(sup.welcome.pid, "supervisor");
  const res = {
    versions: a.boot.versions,
    isPackaged: a.boot.isPackaged,
    window: { shown: Boolean(ev("window-shown")), loadVia: ev("window-shown")?.loadVia, title: ev("window-shown")?.title },
    bundledDeps: ev("window-shown")?.deps?.ok,
    supervisor: { started: sup.started, ms: sup.ms, launcher: sup.info.launcher, execInInstallDir: sup.info.execPath.toLowerCase().startsWith(INSTALL_DIR.toLowerCase()), versions: sup.info.versions, rssMb: mb(sup.info.rss) },
    processes: processesUnder(INSTALL_DIR),
  };
  // 设置里的“安装命令行工具”：由应用把 bin 目录加进用户 PATH
  res.installCli = await S.control("install-cli", { pid: a.pid }, 30_000);
  const snap = snapshot();
  res.userPathAfter = { containsBin: snap.userPath.toLowerCase().split(";").includes(binDir().toLowerCase()), kind: snap.userPathKind, kindBefore: before.userPathKind, prefixUnchanged: snap.userPath.startsWith(before.userPath === "<absent>" ? "" : before.userPath.replace(/;$/, "")) };
  res.installCliAgain = (await S.control("install-cli", { pid: a.pid }, 30_000)).result?.changed; // 再点一次不应该重复添加
  const st = cli(["status"]);
  res.cliStatus = { code: st.code, samePid: st.json?.supervisor?.pid === sup.welcome.pid };
  const run = await startRun();
  res.cliRun = { ok: run.ok, portOpen: await portOpen(run.port), detail: run.detail };
  res.quit = await S.quitApp(a.pid);
  await sleep(1500);
  res.afterQuit = { supervisorAlive: alive(sup.welcome.pid), runAlive: alive(run.pid), portOpen: await portOpen(run.port) };
  res.stop = cli(["installer-stop", "--reason", "test"]).json;
  res.afterStop = { supervisorAlive: alive(sup.welcome.pid), runAlive: alive(run.pid), portOpen: await portOpen(run.port) };
  return res;
});

// 内置命令行：从三种终端调用，参数、退出码；启动耗时
await step("cli", async () => {
  const res = {};
  // 新开的终端拿到的 PATH = 系统 PATH + 用户 PATH（注册表里的值）。这里照这个规则拼出来，证明写进注册表的那一项够用
  const regPath = ps("[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')").stdout.trim();
  const env = cleanEnv({ PATH: regPath, Path: regPath });
  const expectArgs = ["hello world", "中文 参数", "a&b", "50%", "x^y", ""];
  const parseArgs = (stdout) => {
    const line = stdout.split(/\r?\n/).find((l) => l.startsWith('{"args"'));
    try {
      return JSON.parse(line).args;
    } catch {
      return null;
    }
  };
  const verdict = (r) => {
    const args = parseArgs(r.stdout);
    return { exit: r.code, where: /^where=(.*)$/m.exec(r.stdout)?.[1]?.trim().replace(INSTALL_DIR, "<install>"), version: /runyard \d\S+/.exec(r.stdout)?.[0] ?? null, args, argsIntact: JSON.stringify(args) === JSON.stringify(expectArgs), exitCodeSeen: /exit=(-?\d+)/.exec(r.stdout)?.[1] ?? null, raw: r.stdout.trim().slice(0, 700), stderr: r.stderr.trim().slice(0, 300) };
  };
  // cmd：命令行整句交给 cmd /c（Unicode 命令行，不经过批处理文件的代码页）
  const cmdLine = (line) => sh("cmd.exe", ["/d", "/s", "/c", `"${line}"`], { env, windowsVerbatimArguments: true });
  // 三句分开跑：同一句里出现两处 % 会被 cmd 当成一个变量名
  const c1 = cmdLine("for %i in (runyard.cmd) do @echo where=%~$PATH:i & runyard --version");
  const c2 = cmdLine('runyard echo-args "hello world" "中文 参数" "a&b" "50%" "x^y" ""');
  const c3 = cmdLine("runyard exit-with 7 & call echo exit=%^ERRORLEVEL%");
  res.cmd = verdict({ code: c2.code, stdout: [c1.stdout, c2.stdout, c3.stdout].join("\n"), stderr: [c1.stderr, c2.stderr, c3.stderr].join("\n") });
  res.cmdExitPropagates = cmdLine("runyard exit-with 9").code;
  // PowerShell：脚本文件带 BOM，5.1 才会按 UTF-8 读
  const psScript = path.join(S.root, "t.ps1");
  fs.writeFileSync(psScript, `\ufeff"where=" + (Get-Command runyard).Source\nrunyard --version\nrunyard echo-args "hello world" "中文 参数" 'a&b' '50%' 'x^y' ''\nrunyard exit-with 7\n"exit=$LASTEXITCODE"\n`);
  res.powershell51 = verdict(sh("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScript], { env }));
  const pwsh = sh("where.exe", ["pwsh.exe"]).stdout.trim().split(/\r?\n/)[0];
  res.pwsh7 = pwsh ? { path: pwsh, ...verdict(sh(pwsh, ["-NoProfile", "-File", psScript], { env })) } : { skipped: "no pwsh" };
  // PowerShell 里不带空格的 a&b 不会被加引号，交给 .cmd 后被 cmd 当成命令分隔符：单独看一眼去掉这个参数后是否正常
  const psScript2 = path.join(S.root, "t2.ps1");
  fs.writeFileSync(psScript2, `\ufeffrunyard echo-args "hello world" "中文 参数" '50%' 'x^y'\n"exit=$LASTEXITCODE"\n`);
  const r2 = sh("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScript2], { env });
  res.powershell51WithoutAmpersand = { args: parseArgs(r2.stdout), exit: /exit=(-?\d+)/.exec(r2.stdout)?.[1] };
  // Git Bash
  const bash = ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"].find((p) => fs.existsSync(p));
  if (bash) {
    const shScript = path.join(S.root, "t.sh");
    const onlyCmd = path.join(S.root, "onlycmd");
    fs.mkdirSync(onlyCmd, { recursive: true });
    fs.writeFileSync(path.join(onlyCmd, "k3probe.cmd"), "@echo probe-ran\r\n");
    fs.writeFileSync(
      shScript,
      [
        'echo "where=$(command -v runyard)"',
        "runyard --version",
        "runyard echo-args \"hello world\" \"中文 参数\" 'a&b' '50%' 'x^y' ''",
        "runyard exit-with 7",
        'echo "exit=$?"',
        'runyard.cmd --version; echo "dotcmd-exit=$?"',
        // 只有 .cmd、没有无扩展名脚本时，bash 找不找得到
        `PATH="$(cygpath -u '${onlyCmd}'):$PATH" k3probe; echo "bare-name-finds-cmd-exit=$?"`,
        `PATH="$(cygpath -u '${onlyCmd}'):$PATH" k3probe.cmd; echo "with-ext-exit=$?"`,
      ].join("\n"),
    );
    const r = sh(bash, [shScript], { env });
    res.gitBash = { bash, ...verdict(r), dotCmd: /dotcmd-exit=(\d+)/.exec(r.stdout)?.[1], bareNameFindsCmd: /bare-name-finds-cmd-exit=(\d+)/.exec(r.stdout)?.[1], withExt: /with-ext-exit=(\d+)/.exec(r.stdout)?.[1] };
  } else res.gitBash = { skipped: "no git bash" };

  // 启动耗时
  cli(["ensure"]);
  S.track(S.discovery()?.pid, "supervisor");
  const cmdShim = path.join(binDir(), "runyard.cmd");
  const variants = {
    "node24:--version": () => sh(process.execPath, [cliJs(), "--version"], { env: cleanEnv(), stdio: "ignore" }),
    "app-runtime-direct:--version": () => sh(exe(), [cliJs(), "--version"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), stdio: "ignore" }),
    "app-runtime-runyard.cmd:--version": () => sh("cmd.exe", ["/d", "/s", "/c", `""${cmdShim}" --version"`], { env: cleanEnv(), stdio: "ignore", windowsVerbatimArguments: true }),
    "node24:status": () => sh(process.execPath, [cliJs(), "status"], { env: cleanEnv(), stdio: "ignore" }),
    "app-runtime-direct:status": () => sh(exe(), [cliJs(), "status"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), stdio: "ignore" }),
    "app-runtime-runyard.cmd:status": () => sh("cmd.exe", ["/d", "/s", "/c", `""${cmdShim}" status"`], { env: cleanEnv(), stdio: "ignore", windowsVerbatimArguments: true }),
    "baseline:cmd /c exit": () => sh("cmd.exe", ["/d", "/c", "exit"], { stdio: "ignore" }),
  };
  const samples = Object.fromEntries(Object.keys(variants).map((k) => [k, []]));
  const failures = {};
  const first = {};
  for (const [k, fn] of Object.entries(variants)) first[k] = Math.round(fn().ms);
  for (let i = 0; i < RUNS; i++) {
    for (const [k, fn] of Object.entries(variants)) {
      const r = fn();
      if (r.code !== 0) failures[k] = (failures[k] ?? 0) + 1;
      samples[k].push(r.ms);
    }
  }
  res.timing = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, stats(v)]));
  res.timingWarmupRun = first;
  res.timingFailures = failures;
  res.runsPerVariant = RUNS;
  res.stop = cli(["installer-stop", "--reason", "test"]).json;
  return res;
});

// 链接协议（命令行部分；真实浏览器里点链接是真机项目）
await step("url", async () => {
  const res = { registry: snapshot().urlCommand?.replace(INSTALL_DIR, "<install>") };
  // 应用没在运行
  let beforeN = S.events().length;
  const s1 = sh("cmd.exe", ["/d", "/c", "start", "", "runyard-k3://open/demo-b"], { env: cleanEnv() });
  const up = await S.waitAppUp(beforeN, 60_000);
  res.whileNotRunning = { startExit: s1.code, appStarted: up.started, up: up.up, urlsInArgv: up.boot?.urlsInArgv, argv: up.boot?.argv.slice(1) };
  // 应用在运行：系统会再启动一个实例，它把命令行交给第一个实例后退出
  beforeN = S.events().length;
  const s2 = sh("cmd.exe", ["/d", "/c", "start", "", "runyard-k3://open/demo-a?x=1&y=2"], { env: cleanEnv() });
  const second = await waitFor(() => S.events().slice(beforeN).find((e) => e.event === "second-instance"), 20_000);
  res.whileRunning = { startExit: s2.code, deliveredTo: second?.pid === up.pid ? "first-instance" : (second?.pid ?? null), urls: second?.urls ?? null, secondInstanceExited: Boolean(S.events().slice(beforeN).find((e) => e.event === "second-instance-exit")) };
  // 链接里带空格和引号时命令行长什么样（参数注入的面）
  beforeN = S.events().length;
  sh("cmd.exe", ["/d", "/c", "start", "", 'runyard-k3://open/x%20y" --inspect=9229 "'], { env: cleanEnv() });
  const inj = await waitFor(() => S.events().slice(beforeN).find((e) => e.event === "second-instance"), 15_000);
  res.oddUrl = { argvTail: inj?.argv.slice(1) ?? null };
  if (up.pid) await S.quitApp(up.pid);
  res.stop = cli(["installer-stop", "--reason", "test"]).json;
  return res;
});

// 管理进程活着时覆盖安装、卸载：本文建议的钩子
await step("liveHook", async () => {
  const res = {};
  {
    // 1) 应用已退出，只剩管理进程和一个运行；0.3.0 → 0.3.1
    const live = await liveSupervisor({ appRunning: false });
    const inst = runInstaller(B["hook-0.3.1"].setup);
    res.upgradeSupervisorOnly = { before: live.state, installer: inst, after: await observe(live), pathStillHasBin: snapshot().userPath.toLowerCase().includes(binDir().toLowerCase()), urlKeyStillThere: snapshot().urlKey };
    await reap(live);
  }
  {
    // 2) 应用窗口还开着，加管理进程和运行；0.3.1 盖 0.3.1
    const live = await liveSupervisor({ appRunning: true });
    const inst = runInstaller(B["hook-0.3.1"].setup);
    res.reinstallAppRunning = { before: live.state, installer: inst, after: await observe(live) };
    await reap(live);
    const a = await startApp(); // 装完的新版能正常起来
    res.reinstallAppRunning.newVersionStarts = { up: a.up, version: a.boot?.version, supervisorProtocol: a.events?.find((e) => e.event === "supervisor")?.welcome.protocol };
    if (a.pid) await S.quitApp(a.pid);
    cli(["installer-stop", "--reason", "test"]);
  }
  {
    // 3) 卸载：管理进程和运行都活着
    const live = await liveSupervisor({ appRunning: false });
    const dir = INSTALL_DIR;
    const un = await runUninstaller();
    res.uninstall = { before: live.state, uninstaller: un, after: await observe(live) };
    await reap(live);
    const after = snapshot();
    res.residue = {
      userPathIdenticalToBefore: after.userPath === before.userPath,
      userPathKindIdentical: after.userPathKind === before.userPathKind,
      userPathBefore: before.userPath.slice(0, 300),
      userPathAfter: after.userPath.slice(0, 300),
      urlKeyGone: !after.urlKey,
      uninstallEntryGone: after.uninstall.length === 0,
      installDirGone: !fs.existsSync(dir),
      shortcutsLeft: [...after.startMenu, ...after.desktop],
      softwareGuidKeysAdded: after.softwareGuidKeys.filter((k) => !before.softwareGuidKeys.includes(k)),
      programsDirAdded: after.programsDir.filter((k) => !before.programsDir.includes(k)),
      appDataAdded: after.appData.filter((k) => !before.appData.includes(k) && !k.includes("runyard-k3-spike")),
    };
    INSTALL_DIR = null;
  }
  return res;
});

// 对照一：打包工具自带的检查（不加钩子）
await step("liveBuilderDefault", async () => {
  const res = { firstInstall: runInstaller(B["default-0.3.0"].setup) };
  {
    const live = await liveSupervisor({ appRunning: false });
    const inst = runInstaller(B["default-0.3.0"].setup);
    res.reinstall = { before: live.state, installer: inst, after: await observe(live) };
    res.reinstall.orphansReaped = await reap(live);
  }
  {
    const live = await liveSupervisor({ appRunning: false });
    const un = await runUninstaller();
    res.uninstall = { before: live.state, uninstaller: un, after: await observe(live) };
    res.uninstall.orphansReaped = await reap(live);
    res.uninstall.pathRestored = snapshot().userPath === before.userPath;
    INSTALL_DIR = null;
  }
  return res;
});

// 对照二：没有任何检查
await step("liveNoCheck", async () => {
  const res = { firstInstall: runInstaller(B["nocheck-0.3.0"].setup) };
  {
    const live = await liveSupervisor({ appRunning: false });
    const inst = runInstaller(B["nocheck-0.3.0"].setup);
    const appStillWorks = cli(["--version"]);
    res.reinstall = { before: live.state, installer: inst, after: await observe(live), installDirExists: fs.existsSync(INSTALL_DIR), cliAfter: { code: appStillWorks.code, out: appStillWorks.stdout.slice(0, 80) }, tempLeftovers: ps("@(Get-ChildItem $env:TEMP -Directory -Filter 'ns*.tmp' -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'old-install') }).Count").stdout.trim() };
    res.reinstall.orphansReaped = await reap(live);
  }
  {
    const live = await liveSupervisor({ appRunning: false });
    const dir = INSTALL_DIR;
    const un = await runUninstaller();
    res.uninstall = { before: live.state, uninstaller: un, after: await observe(live) };
    res.uninstall.orphansReaped = await reap(live);
    await sleep(1000);
    // 把这次对照留下的东西清掉（只删我们自己的安装目录）
    if (dir && fs.existsSync(dir) && path.basename(dir).toLowerCase().includes("runyard")) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    res.uninstall.installDirRemovedByHand = !fs.existsSync(dir);
    INSTALL_DIR = null;
  }
  return res;
});

// 对照三：关掉 runAsNode
await step("runAsNodeOff", async () => {
  const b = await build({ platform: "win", arch: "x64", targets: ["dir"], out: path.join(out, "norunasnode"), cacheDir, fuses: "norunasnode" });
  if (!b.ok) return { buildOk: false, tail: b.highlights.slice(-4) };
  const dir = path.join(b.out, "win-unpacked");
  const beforeN = S.events().length;
  const child = spawn(path.join(dir, "RunyardK3.exe"), [path.join(dir, "resources", "runtime", "runyard-cli.mjs"), "--version"], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: "1" }), stdio: ["ignore", "pipe", "pipe"] });
  S.track(child.pid, "app(norunasnode)");
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d));
  const boot = await waitFor(() => S.events().slice(beforeN).find((e) => e.event === "boot"), 20_000);
  const outcome = await waitFor(() => S.events().slice(beforeN).find((e) => e.event === "supervisor-failed" || e.event === "supervisor"), 40_000, 200);
  const res = { buildOk: true, cliAttempt: { printedVersion: stdout.includes("runyard 0.3.0"), startedAsFullApp: Boolean(boot) }, appTriesToStartSupervisor: { outcome: outcome?.event ?? "timeout", code: outcome?.code ?? null, secondInstancesSpawned: S.events().slice(beforeN).filter((e) => e.event === "second-instance-exit").length } };
  await S.quitApp(child.pid);
  S.killTracked(child.pid);
  await sleep(1000);
  res.leftover = processesUnder(dir);
  return res;
});

// ---------- 收尾 ----------
log("== cleanup");
const cleanup = {};
if (installInfo()) cleanup.finalUninstall = await runUninstaller();
for (const e of S.events().filter((x) => x.event === "boot")) if (alive(e.pid)) S.killTracked(S.track(e.pid, "app"));
const after = snapshot();
R.snapshotAfter = after;
cleanup.identicalToBefore = Object.fromEntries(Object.keys(before).map((k) => [k, JSON.stringify(before[k]) === JSON.stringify(after[k])]));
cleanup.hookLogTail = readHookLog().split(/\r?\n/).filter(Boolean).slice(-6).map((l) => l.slice(0, 300));
fs.rmSync(HOOK_LOG, { force: true });
const rootPath = S.root;
cleanup.session = S.cleanup();
cleanup.processesLeft = psJsonArr(`Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'RunyardK3.exe' -or ($_.CommandLine -and $_.CommandLine.Contains('${path.basename(rootPath)}') -and $_.ProcessId -ne $PID) } | ForEach-Object { '{0}:{1}' -f $_.ProcessId, $_.Name }`);
R.cleanup = cleanup;
R.finishedAt = new Date().toISOString();
const file = writeResults(`win32-${process.arch}-${opt("label", "ci")}.json`, R);
log(`results → ${file}`);

const s = R.steps;
const verdicts = {
  "打包成功（NSIS，按用户安装）": s.build?.allOk && Object.values(s.build.allOk).every(Boolean) && s.install?.perUser === true,
  "静默安装后应用能打开、开出窗口": s.app?.window?.shown === true,
  "管理进程由安装后的应用用自带运行时拉起，应用退出后还在": s.app?.afterQuit?.supervisorAlive === true && s.app?.supervisor?.execInInstallDir === true,
  "内置命令行可用（cmd）": s.cli?.cmd?.version != null && s.cli?.cmd?.exitCodeSeen === "7",
  "内置命令行可用（PowerShell 5.1）": s.cli?.powershell51?.version != null && s.cli?.powershell51?.exitCodeSeen === "7",
  "内置命令行可用（Git Bash）": s.cli?.gitBash?.version != null && s.cli?.gitBash?.exitCodeSeen === "7",
  "命令行启动不慢于 150 ms（--version，runyard.cmd，中位数）": s.cli?.timing ? s.cli.timing["app-runtime-runyard.cmd:--version"].median <= 150 : null,
  "链接生效（命令行 start；未运行 / 运行中）": s.url ? (s.url.whileNotRunning?.urlsInArgv?.length ?? 0) > 0 && (s.url.whileRunning?.urls?.length ?? 0) > 0 : null,
  "管理进程活着时覆盖安装成功（钩子）": s.liveHook?.upgradeSupervisorOnly?.installer?.exit === 0 && s.liveHook?.upgradeSupervisorOnly?.installer?.buildInfo === "0.3.1" && s.liveHook?.upgradeSupervisorOnly?.after?.supervisorAlive === false && s.liveHook?.upgradeSupervisorOnly?.after?.runAlive === false,
  "管理进程活着时卸载成功（钩子）": s.liveHook?.uninstall?.uninstaller?.uninstallKeyGone === true && s.liveHook?.residue?.installDirGone === true && s.liveHook?.uninstall?.after?.runAlive === false,
  "卸载后用户 PATH 没有残留": s.liveHook?.residue?.userPathIdenticalToBefore === true,
  "清理干净": Array.isArray(cleanup.processesLeft) && cleanup.processesLeft.length === 0 && cleanup.identicalToBefore.userPath && cleanup.identicalToBefore.urlKey && cleanup.identicalToBefore.uninstall,
};
console.log("\n===== K3 Windows 判定 =====");
for (const [k, v] of Object.entries(verdicts)) console.log(`${v === true ? "通过  " : v === false ? "不通过" : "未知  "} ${k}`);
if (s.cli?.timing) {
  console.log(`\n启动耗时（毫秒，中位数 / p95 / 最大，n=${RUNS}）`);
  for (const [k, v] of Object.entries(s.cli.timing)) console.log(`  ${k.padEnd(40)} ${v.median} / ${v.p95} / ${v.max}`);
}
console.log(JSON.stringify({ cleanup }, null, 1));
const failed = Object.entries(s).filter(([, v]) => v.error).map(([k]) => k);
if (failed.length) {
  console.log(`出错的步骤：${failed.join(", ")}`);
  process.exitCode = 1;
}
