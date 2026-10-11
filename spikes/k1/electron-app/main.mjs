// 最小的“桌面应用”：真正的 Electron 主进程，不开窗口。
// 它做应用该做的三件事：用自己的可执行文件（ELECTRON_RUN_AS_NODE=1）拉起管理进程、
// 保持一条连接并起“标签页持有”的运行、正常退出前先道别。
// 测试程序通过两个文件和它打交道：状态文件（它写）和控制文件（测试写 quit）。
import fs from "node:fs";
import { app } from "electron";
import { ensureSupervisor } from "../lib/client.mjs";
import { loadConfig } from "../lib/config.mjs";

const conf = JSON.parse(fs.readFileSync(process.env.K1_APP_CONFIG, "utf8"));
// 用户数据目录放进测试的临时目录，不碰真实的 ~/Library/Application Support
app.setPath("userData", conf.userData);
app.dock?.hide(); // macOS：这个测试应用不需要 Dock 图标
app.on("window-all-closed", () => {});

const status = { appPid: process.pid, phase: "booting", execPath: process.execPath, t: { boot: Date.now() } };
const writeStatus = () => {
  fs.writeFileSync(`${conf.statusFile}.tmp`, JSON.stringify(status));
  fs.renameSync(`${conf.statusFile}.tmp`, conf.statusFile);
};

let conn = null;
let saidBye = false;

app.on("before-quit", (event) => {
  if (saidBye || !conn) return;
  // 正常退出：先通知管理进程停掉本应用标签页持有的运行，最多等 5 秒（§2.4），然后才真的退出
  event.preventDefault();
  saidBye = true;
  status.t.quitRequested = Date.now();
  const cap = new Promise((resolve) => setTimeout(resolve, 5_000));
  Promise.race([conn.request("session.bye").catch((err) => ({ error: String(err) })), cap]).then((bye) => {
    status.bye = bye ?? "timeout";
    status.t.byeDone = Date.now();
    status.phase = "quitting";
    writeStatus();
    app.quit();
  });
});

// 不能在模块顶层 await app.whenReady()：Electron 要等入口模块加载完才发 ready，顶层等它就是互相等（实测卡死）
async function main() {
  await app.whenReady();
  status.t.ready = Date.now();
  const cfg = loadConfig(conf.cfgArgs);
  if (conf.at) while (Date.now() < conf.at) await new Promise((r) => setTimeout(r, 1));
  status.t.ensureBegin = Date.now();
  const ensured = await ensureSupervisor(cfg, { kind: "app", clientId: conf.clientId });
  conn = ensured.conn;
  status.t.ensureDone = Date.now();
  status.supervisor = { pid: conn.welcome.pid, instanceId: conn.welcome.instanceId, launcher: conn.welcome.launcher, started: ensured.started, timings: ensured.timings };
  status.runs = [];
  for (const run of conf.runs ?? []) status.runs.push(await conn.request("run.start", run));
  status.phase = "ready";
  writeStatus();
  const poll = setInterval(() => {
    if (!fs.existsSync(conf.controlFile)) return;
    clearInterval(poll); // 只触发一次：再调一次 app.quit() 会绕过下面“先道别”的等待
    app.quit();
  }, 25);
}

main().catch((err) => {
  status.phase = "failed";
  status.error = { code: err.code ?? "INTERNAL", detail: String(err.stack ?? err) };
  writeStatus();
  app.exit(1);
});
