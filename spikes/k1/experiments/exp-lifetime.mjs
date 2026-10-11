// 实验 B：应用退出或被强杀之后，各种运行和管理进程的下场（技术设计 §2.4）。
// 应用是真正的 Electron 进程；管理进程由它用自己的可执行文件加 ELECTRON_RUN_AS_NODE=1 拉起。
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { alive, cleanupState, cli, cliHold, eventsOf, freePort, httpRun, newState, portOpen, runArgs, runGone, sleep, startApp, stats, viteAvailable, viteRun, waitFor } from "../lib/harness.mjs";

// macOS：某个进程是否登记在 LaunchServices 里（登记了才可能有 Dock 图标）。返回 null（没登记）或它的类型
export function lsappinfoType(pid) {
  if (process.platform !== "darwin") return undefined;
  try {
    const out = execFileSync("lsappinfo", ["list"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const entry = out.split(/\n(?=\s*\d+\) )/).find((e) => new RegExp(`pid = ${pid}\\b`).test(e));
    if (!entry) return null;
    return /type="([^"]+)"/.exec(entry)?.[1] ?? "listed";
  } catch (err) {
    return `lsappinfo-failed:${err.code ?? err.status}`;
  }
}

async function round({ mode, vite }) {
  const cfg = newState("lt");
  try {
    const tabPort = await freePort();
    const cliPort = await freePort();
    const tabRun = vite ? viteRun(cfg, tabPort, "tab") : httpRun(tabPort, "tab");
    const app = await startApp(cfg, { runs: [tabRun] });
    const sup = app.status.supervisor;
    const tab = app.status.runs[0];
    const dock = { supervisor: lsappinfoType(sup.pid), app: lsappinfoType(app.pid) };
    // 命令行（普通 Node）起一个它自己持有的运行，然后命令行进程退出
    const viaCli = await cli(cfg, "run", runArgs(vite ? viteRun(cfg, cliPort) : httpRun(cliPort)));
    if (!viaCli.ok) throw new Error(`命令行起运行失败：${JSON.stringify(viaCli)}`);
    const cliRun = viaCli.result;

    const t0 = Date.now();
    if (mode === "quit") app.quit();
    else app.kill();
    const tabGoneMs = await runGone(tab);
    const exit = await Promise.race([app.exited, sleep(15_000).then(() => null)]);
    // 应用已经没了：再等 2 秒，看管理进程和命令行持有的运行是否还在
    await sleep(2_000);
    const info = await cli(cfg, "supervisor.info", ["--no-launch", "--start-timeout-ms", "2000"]);
    const ev = eventsOf(cfg);
    const at = (name) => ev.find((e) => e.event === name && e.at >= t0)?.at;
    const status = app.readStatus();
    return {
      mode,
      vite,
      supervisorStartedByApp: sup.started && sup.launcher === "electron",
      supervisorExecIsElectron: /electron/i.test(info.result?.execPath ?? ""),
      dock,
      tabGoneMs,
      appExitMs: exit ? exit.at - t0 : -1,
      appGone: !alive(app.pid),
      supervisorAliveAfter: alive(sup.pid) && info.ok && info.supervisorPid === sup.pid,
      cliRunAliveAfter: alive(cliRun.pid) && (await portOpen(cliRun.port)),
      runsLeftInSupervisor: info.result?.runs,
      // 时间花在哪：收到退出请求 / 发现连接断开 → 开始停止 → 进程退出
      breakdown:
        mode === "quit"
          ? { signalToQuitHandlerMs: status?.t?.quitRequested - t0, stopBeginMs: at("run-stop-begin") - t0, runExitMs: at("run-exit") - t0, byeDoneMs: status?.t?.byeDone - t0 }
          : { detectMs: at("app-connection-lost") - t0, stopBeginMs: at("run-stop-begin") - t0, runExitMs: at("run-exit") - t0 },
    };
  } finally {
    await cleanupState(cfg);
  }
}

async function series(mode, limitMs, quick) {
  const rounds = [];
  const total = quick ? 2 : 10;
  for (let i = 0; i < total; i++) rounds.push(await round({ mode, vite: i % 3 === 0 && viteAvailable() }));
  const ok = (r) => r.tabGoneMs >= 0 && r.tabGoneMs <= limitMs && r.supervisorAliveAfter && r.cliRunAliveAfter && r.supervisorStartedByApp && r.appGone;
  const pick = (key) => stats(rounds.map((r) => r.breakdown[key]));
  return {
    pass: rounds.every(ok),
    rounds: rounds.length,
    viteRounds: rounds.filter((r) => r.vite).length,
    limitMs,
    tabGoneMs: stats(rounds.map((r) => r.tabGoneMs)),
    tabGoneMsVite: stats(rounds.filter((r) => r.vite).map((r) => r.tabGoneMs)),
    appExitMs: stats(rounds.map((r) => r.appExitMs)),
    supervisorSurvived: rounds.filter((r) => r.supervisorAliveAfter).length,
    supervisorStartedByElectronApp: rounds.filter((r) => r.supervisorStartedByApp && r.supervisorExecIsElectron).length,
    cliRunSurvived: rounds.filter((r) => r.cliRunAliveAfter).length,
    breakdown: Object.fromEntries(Object.keys(rounds[0].breakdown).map((k) => [k, pick(k)])),
    dockSamples: rounds.slice(0, 3).map((r) => r.dock),
    failures: rounds.filter((r) => !ok(r)),
  };
}

// 正常退出：标签页持有的运行 3 秒内停止；命令行持有的还在；管理进程还在
export const appQuit = ({ quick }) => series("quit", 3_000, quick);
// 强杀：标签页持有的运行 10 秒内停止（连接断开后等 5 秒再停）
export const appKill = ({ quick }) => series("kill", 10_000, quick);

// 那 5 秒是留给重连的：同一个应用（同一个 clientId）在 5 秒内连回来，运行就不该被停
export async function reconnect({ quick }) {
  const rounds = [];
  for (let i = 0; i < (quick ? 1 : 3); i++) {
    const cfg = newState("rc");
    try {
      const clientId = crypto.randomUUID();
      const port = await freePort();
      const first = cliHold(cfg, "run", [...runArgs(httpRun(port, "tab")), "--kind", "app", "--client-id", clientId]);
      const started = await first.first;
      const run = started.result;
      const t0 = Date.now();
      first.kill(); // 没有道别就消失
      await sleep(2_000);
      const second = cliHold(cfg, "ensure", ["--kind", "app", "--client-id", clientId]);
      await second.first;
      await waitFor(() => Date.now() - t0 > 8_000, 9_000, 50);
      const aliveAt8s = alive(run.pid) && (await portOpen(port));
      const t1 = Date.now();
      second.end(); // 这次正常道别
      const goneAfterByeMs = await runGone(run);
      rounds.push({ aliveAt8s, goneAfterByeMs, totalMs: Date.now() - t1 });
    } finally {
      await cleanupState(cfg);
    }
  }
  return { pass: rounds.every((r) => r.aliveAt8s && r.goneAfterByeMs >= 0 && r.goneAfterByeMs <= 3_000), rounds };
}
