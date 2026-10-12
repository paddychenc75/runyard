// K3 的最小“桌面应用”（打进 asar）。它只做验证需要的几件事：
//   开一个窗口；用自己的可执行文件（ELECTRON_RUN_AS_NODE=1）拉起管理进程并保持连接（K1 的客户端原样复用）；
//   记录链接（runyard-k3://）是怎么送到的；试发一条系统通知；按测试程序的指令退出。
// 和测试程序之间只靠临时目录里的文件说话：事件文件（它追加）、control/（测试写指令）、reply/（它写回执）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Notification, protocol } from "electron";

const SCHEME = "runyard-k3";
const runtimeDir = path.join(process.resourcesPath, "runtime");
const fromRuntime = (file) => import(pathToFileURL(path.join(runtimeDir, file)).href);
const { readSpikeConfig, readBuildInfo } = await fromRuntime("k3-pointer.mjs");
const spike = readSpikeConfig();
// 没有指针文件就立刻退出：这个实验应用绝不使用真实的用户目录
if (!spike) process.exit(64);

const build = readBuildInfo();
const root = spike.root;
// 用户数据、日志、崩溃转储全部放进临时目录，不碰 ~/Library/Application Support 和 %APPDATA%
app.setPath("userData", path.join(root, "userdata"));
app.setPath("sessionData", path.join(root, "userdata"));
app.setAppLogsPath(path.join(root, "applogs"));
app.setPath("crashDumps", path.join(root, "crashdumps"));

// 界面只从应用自己的协议 app://runyard/ 加载（§6.5）。这一句必须在 ready 之前
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const eventsFile = path.join(root, "app-events.jsonl");
const event = (name, data = {}) => fs.appendFileSync(eventsFile, `${JSON.stringify({ at: Date.now(), pid: process.pid, event: name, ...data })}\n`);
const urlsIn = (argv) => argv.filter((a) => a.startsWith(`${SCHEME}://`));

event("boot", {
  version: build.version,
  protocol: build.protocol,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  execPath: process.execPath,
  resourcesPath: process.resourcesPath,
  argv: process.argv,
  urlsInArgv: urlsIn(process.argv),
  versions: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome },
  arch: process.arch,
  tmpdir: os.tmpdir(),
});

// macOS：链接经 open-url 事件送达，应用没在运行时这个事件可能早于 ready，所以要在最前面就接上
app.on("open-url", (e, url) => {
  e.preventDefault();
  event("open-url", { url, ready: app.isReady() });
});

// 单实例：第二个实例把自己的命令行交给第一个然后退出。Windows 上链接就是这样送到正在运行的应用的
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  event("second-instance-exit", { argv: process.argv });
  app.exit(0);
}
app.on("second-instance", (_e, argv) => event("second-instance", { argv, urls: urlsIn(argv) }));

let conn = null;
let saidBye = false;
let win = null;

app.on("window-all-closed", () => {
  // Windows 上关掉最后一个窗口就是退出（§2.4）；macOS 上应用留着
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (e) => {
  if (saidBye || !conn) return;
  // 正常退出：先道别，让管理进程停掉标签页持有的运行，最多等 5 秒（§2.4，做法同 K1）
  e.preventDefault();
  saidBye = true;
  const cap = new Promise((resolve) => setTimeout(resolve, 5_000));
  Promise.race([conn.request("session.bye").catch((err) => ({ error: String(err) })), cap]).then((bye) => {
    event("bye", { bye: bye ?? "timeout" });
    app.quit();
  });
});
app.on("quit", () => event("quit"));

// §8.2 “macOS 应用启动时”：发现文件里记的可执行文件已经不存在，说明应用被替换或挪走了，
// 旧的管理进程跑的是不存在的文件。没有运行就请它退出（随后由 ensureSupervisor 起新的），有运行就只提示。
async function retireSupervisorIfExecGone(client, cfg) {
  const discovery = client.readDiscovery(cfg);
  if (!discovery?.execPath || fs.existsSync(discovery.execPath)) return { checked: true, execGone: false, execPath: discovery?.execPath ?? null };
  const r = await client.connectOnce(cfg, { kind: "app", clientId: `retire-${process.pid}` });
  if (!r.conn) return { checked: true, execGone: true, action: "not-running" };
  try {
    await r.conn.request("supervisor.shutdown", { ifIdle: true, reason: "upgrade" });
    await new Promise((resolve) => r.conn.socket.once("close", resolve));
    return { checked: true, execGone: true, action: "replaced", oldPid: r.conn.welcome.pid };
  } catch (err) {
    r.conn.close();
    return { checked: true, execGone: true, action: err.code === "SUPERVISOR_BUSY" ? "kept-has-runs" : `error:${err.code}`, oldPid: r.conn.welcome.pid };
  }
}

async function connectSupervisor() {
  const client = await fromRuntime("lib/client.mjs");
  const { loadConfig } = await fromRuntime("lib/config.mjs");
  const cfg = loadConfig([...spike.cfgArgs, "--protocol", String(build.protocol)]);
  const t0 = Date.now();
  const execCheck = await retireSupervisorIfExecGone(client, cfg);
  const ensured = await client.ensureSupervisor(cfg, { kind: "app", clientId: `app-${process.pid}` });
  conn = ensured.conn;
  const info = await conn.request("supervisor.info");
  event("supervisor", { started: ensured.started, notice: ensured.notice ?? null, ms: Date.now() - t0, execCheck, welcome: { pid: conn.welcome.pid, instanceId: conn.welcome.instanceId, protocol: conn.welcome.protocol, launcher: conn.welcome.launcher, runs: conn.welcome.runs }, info });
}

function tryNotification(id) {
  return new Promise((resolve) => {
    const result = { supported: Notification.isSupported(), outcome: "timeout" };
    if (!result.supported) return resolve({ ...result, outcome: "unsupported" });
    const n = new Notification({ title: "Runyard K3", body: `技术验证的测试通知 ${id}` });
    const done = (outcome, extra = {}) => resolve({ ...result, outcome, ...extra });
    n.on("show", () => done("show"));
    n.on("failed", (_e, error) => done("failed", { error: String(error) }));
    n.show();
    setTimeout(() => done("timeout-8s"), 8_000);
  });
}

// 依赖有没有被打进包：chokidar 是直接依赖，readdirp 是它的依赖（pnpm 下在 .pnpm 里，不在顶层）
async function checkBundledDeps() {
  try {
    const chokidar = await import("chokidar");
    const require = createRequire(import.meta.url);
    const chokidarEntry = require.resolve("chokidar");
    const readdirp = createRequire(chokidarEntry).resolve("readdirp");
    return { ok: typeof chokidar.watch === "function", chokidarEntry, readdirp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

const commands = {
  quit: () => {
    setImmediate(() => app.quit());
    return { quitting: true };
  },
  notify: (c) => tryNotification(c.id),
  "supervisor-info": () => conn.request("supervisor.info"),
  request: (c) => conn.request(c.method, c.params ?? {}),
  // Windows 的“安装命令行工具”：设置页那个按钮要做的事，由应用自己把 bin 目录加进用户 PATH
  "install-cli": async () => (await fromRuntime("k3-installer-helper.mjs")).editUserPath("add"),
  state: () => ({ windows: BrowserWindow.getAllWindows().length, visible: win?.isVisible() ?? false, focused: win?.isFocused() ?? false }),
};

function pollControl() {
  const dir = path.join(root, "control");
  const replyDir = path.join(root, "reply");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(replyDir, { recursive: true });
  const busy = new Set();
  setInterval(() => {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json") || busy.has(name)) continue;
      busy.add(name);
      let c;
      try {
        c = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch {
        busy.delete(name); // 写了一半，下一轮再读
        continue;
      }
      if (c.pid && c.pid !== process.pid) {
        busy.delete(name); // 指给别的实例的
        continue;
      }
      fs.rmSync(path.join(dir, name), { force: true });
      Promise.resolve()
        .then(() => commands[c.cmd](c))
        .then((result) => ({ ok: true, result }), (err) => ({ ok: false, error: String(err.code ?? err) }))
        .then((reply) => {
          fs.writeFileSync(path.join(replyDir, `${c.id}.tmp`), JSON.stringify(reply));
          fs.renameSync(path.join(replyDir, `${c.id}.tmp`), path.join(replyDir, `${c.id}.json`));
        });
    }
  }, 40);
}

// 不能在模块顶层 await app.whenReady()（K1 实测会互相等），所以放进函数里
async function main() {
  await app.whenReady();
  event("ready");
  // 保险：测试程序万一崩了，应用到时间自己退出，不会留在机器上
  setTimeout(() => app.quit(), spike.maxAppLifetimeMs ?? 300_000).unref?.();
  win = new BrowserWindow({ width: 560, height: 180, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const pagesDir = path.join(app.getAppPath(), "app");
  protocol.handle("app", (request) => {
    const u = new URL(request.url);
    const file = path.normalize(path.join(pagesDir, decodeURIComponent(u.pathname)));
    // 只给 app://runyard/ 下、解析后仍在包内页面目录里的文件
    if (u.host !== "runyard" || !file.startsWith(pagesDir + path.sep)) return new Response("forbidden", { status: 403 });
    try {
      return new Response(fs.readFileSync(file), { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
  // loadVia=file 是对照：关掉 grantFileProtocolExtraPrivileges 之后，file:// 读不到 asar 里的页面
  const loadVia = spike.loadVia ?? "app-protocol";
  if (loadVia === "file") await win.loadFile(path.join(pagesDir, "index.html"));
  else await win.loadURL("app://runyard/index.html");
  // showInactive：不抢走负责人正在用的窗口的焦点
  win.showInactive();
  event("window-shown", { loadVia, title: win.getTitle(), appPath: app.getAppPath(), deps: await checkBundledDeps() });
  pollControl();
  try {
    await connectSupervisor();
  } catch (err) {
    event("supervisor-failed", { code: err.code ?? "INTERNAL", detail: String(err.stack ?? err) });
  }
  event("up");
}

if (spike && gotLock) {
  main().catch((err) => {
    event("failed", { detail: String(err.stack ?? err) });
    app.exit(1);
  });
}
