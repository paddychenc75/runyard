// 实验 A：同时启动。任何时候都不许出现两个管理进程。
import { alive, cleanupState, cli, isWin, liveSupervisors, newState, sleep, startApp, startsOf, stats, waitFor } from "../lib/harness.mjs";

// 一轮：n 个客户端在同一毫秒开始“连不上就启动”。
// stale = 先起一个管理进程再强杀它，留下残留的 socket 文件和发现文件（Windows 上只留发现文件）。
// electron = 其中一个客户端是真正的 Electron 应用。
async function round({ lockMode, stale, n, electron }) {
  const cfg = newState("cc", { lockMode });
  try {
    if (stale) {
      const first = await cli(cfg, "ensure");
      process.kill(first.supervisorPid, "SIGKILL");
      await waitFor(() => !alive(first.supervisorPid), 5_000);
    }
    const before = startsOf(cfg).length;
    const at = Date.now() + (electron ? 2_500 : 350);
    const jobs = [];
    for (let i = electron ? 1 : 0; i < n; i++) jobs.push(cli(cfg, "ensure", ["--at", String(at), "--kind", i % 2 ? "cli" : "app"]));
    let app = null;
    if (electron) {
      jobs.push(
        startApp(cfg, { at }).then(
          (a) => {
            app = a;
            return { ok: true, supervisorPid: a.status.supervisor.pid, instanceId: a.status.supervisor.instanceId, started: a.status.supervisor.started, ensureMs: a.status.t.ensureDone - a.status.t.ensureBegin, appLate: a.status.t.ready > at };
          },
          (err) => ({ ok: false, code: "APP_FAILED", detail: String(err) }),
        ),
      );
    }
    const results = await Promise.all(jobs);
    await sleep(250); // 给“输掉的”管理进程留出退出的时间
    const live = liveSupervisors(cfg);
    const fresh = startsOf(cfg).slice(before);
    if (app) {
      app.kill();
      await app.exited;
    }
    const instances = new Set(results.filter((r) => r.ok).map((r) => r.instanceId));
    return {
      failures: results.filter((r) => !r.ok).map((r) => `${r.code}:${String(r.detail).slice(0, 200)}`),
      distinctInstances: instances.size,
      liveSupervisors: live.length,
      listeningRecords: fresh.filter((s) => s.phase === "listening").length,
      bootRecords: fresh.filter((s) => s.phase === "boot").length,
      launchers: results.filter((r) => r.started).length,
      ensureMs: results.filter((r) => r.ok).map((r) => r.ensureMs),
      appLate: results.some((r) => r.appLate),
    };
  } finally {
    await cleanupState(cfg);
  }
}

async function series(label, rounds, opts) {
  const all = [];
  for (let i = 0; i < rounds; i++) all.push(await round(opts));
  const bad = all.filter((r) => r.distinctInstances !== 1 || r.liveSupervisors !== 1 || r.failures.length > 0);
  return {
    label,
    ...opts,
    rounds,
    violations: bad.length,
    roundsWithTwoLive: all.filter((r) => r.liveSupervisors > 1).length,
    roundsWithTwoInstancesSeenByClients: all.filter((r) => r.distinctInstances > 1).length,
    roundsWithClientFailure: all.filter((r) => r.failures.length > 0).length,
    sampleFailures: bad.flatMap((r) => r.failures).slice(0, 3),
    // 每轮有几个进程真的走到了“我来启动”这一步：大于 1 才说明竞争确实发生了
    meanLaunchAttemptsPerRound: Number((all.reduce((a, r) => a + r.bootRecords, 0) / rounds).toFixed(2)),
    roundsWhereAppMissedTheStartTime: all.filter((r) => r.appLate).length,
    ensureMs: stats(all.flatMap((r) => r.ensureMs)),
  };
}

export async function concurrency({ quick }) {
  const rounds = quick ? 3 : 20;
  const out = [];
  // Windows 上没有锁的两种做法之分（管道本身就是锁），只跑一遍
  const modes = isWin ? ["kernel"] : ["kernel", "naive"];
  for (const lockMode of modes) {
    for (const stale of [false, true]) {
      for (const n of [2, 8]) out.push(await series(`${lockMode}/${stale ? "stale" : "fresh"}/n=${n}`, rounds, { lockMode, stale, n, electron: false }));
    }
  }
  out.push(await series("kernel/fresh/electron-app+cli", rounds, { lockMode: "kernel", stale: false, n: 2, electron: true }));
  out.push(await series("kernel/stale/electron-app+cli", quick ? 2 : 10, { lockMode: "kernel", stale: true, n: 2, electron: true }));
  const recommended = out.filter((s) => s.lockMode === "kernel");
  return {
    // 判定只看推荐做法（kernel）；naive 是对照
    pass: recommended.every((s) => s.violations === 0),
    series: out,
  };
}
