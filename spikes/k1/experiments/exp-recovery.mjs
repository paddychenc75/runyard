// 实验 C：残留状态的恢复，和版本不一致时的握手表（技术设计 §5.4）。
import fs from "node:fs";
import { endpointOf, pathsOf } from "../lib/config.mjs";
import { alive, cleanupState, cli, freePort, httpRun, isWin, newState, portOpen, runArgs, stats, waitFor } from "../lib/harness.mjs";

// 管理进程被强杀：socket 文件（POSIX）和发现文件留在原地。下一个客户端应当自己恢复。
export async function staleRecovery({ quick }) {
  const rounds = [];
  const modes = isWin ? ["kernel"] : ["kernel", "naive"];
  for (const lockMode of modes) {
    for (let i = 0; i < (quick ? 2 : 10); i++) {
      const cfg = newState("st", { lockMode });
      try {
        const withChild = i % 2 === 1; // 一半的轮次里，被强杀的管理进程还留下一个活着的子进程
        const first = await cli(cfg, "ensure");
        let orphan = null;
        if (withChild) orphan = (await cli(cfg, "run", runArgs(httpRun(await freePort())))).result;
        process.kill(first.supervisorPid, "SIGKILL");
        await waitFor(() => !alive(first.supervisorPid), 5_000);
        const left = {
          socketFile: isWin ? null : fs.existsSync(endpointOf(cfg)),
          discoveryFile: fs.existsSync(pathsOf(cfg).discovery),
          orphanAlive: orphan ? alive(orphan.pid) && (await portOpen(orphan.port)) : null,
        };
        const second = await cli(cfg, "ensure");
        const third = await cli(cfg, "supervisor.info");
        rounds.push({
          lockMode,
          withChild,
          left,
          recovered: second.ok && second.started && second.supervisorPid !== first.supervisorPid && third.ok && third.supervisorPid === second.supervisorPid,
          recoverMs: second.ensureMs,
          detail: second.ok ? undefined : second,
        });
      } finally {
        await cleanupState(cfg);
      }
    }
  }
  return {
    pass: rounds.every((r) => r.recovered),
    rounds: rounds.length,
    recovered: rounds.filter((r) => r.recovered).length,
    recoverMs: stats(rounds.map((r) => r.recoverMs)),
    // 证明前提成立：强杀之后确实留下了残留
    leftSocketFile: rounds.filter((r) => r.left.socketFile).length,
    leftDiscoveryFile: rounds.filter((r) => r.left.discoveryFile).length,
    // 管理进程死了以后，它的子进程是否还活着（§2.4 说“多数开发服务器会自己退出”，这里的极小服务不会）
    orphanStillAlive: `${rounds.filter((r) => r.left.orphanAlive).length}/${rounds.filter((r) => r.withChild).length}`,
    failures: rounds.filter((r) => !r.recovered),
  };
}

// 握手表的五行，外加“管理进程较新但仍愿意服务”。supervisor 列是先启动的管理进程，client 列是后来的客户端。
export async function versionSkew() {
  const cases = [
    { name: "协议相同", sup: { protocol: 1 }, client: { protocol: 1 }, runs: 0, expect: { ok: true, samePid: true } },
    { name: "管理进程较旧，没有运行 → 换新", sup: { protocol: 1 }, client: { protocol: 2, minServerProtocol: 1 }, runs: 0, expect: { ok: true, samePid: false, protocol: 2, started: true } },
    { name: "管理进程较旧，有运行，仍满足最低版本 → 兼容使用并提示", sup: { protocol: 1 }, client: { protocol: 2, minServerProtocol: 1 }, runs: 1, expect: { ok: true, samePid: true, notice: "SUPERVISOR_OLDER_COMPAT" } },
    { name: "管理进程较旧，有运行，不满足 → SUPERVISOR_OUTDATED", sup: { protocol: 1 }, client: { protocol: 2, minServerProtocol: 2 }, runs: 1, expect: { ok: false, code: "SUPERVISOR_OUTDATED" } },
    { name: "管理进程较新，客户端低于它的最低要求 → CLIENT_OUTDATED", sup: { protocol: 3, minClientProtocol: 2 }, client: { protocol: 1 }, runs: 0, expect: { ok: false, code: "CLIENT_OUTDATED" } },
    { name: "管理进程较新，仍愿意服务", sup: { protocol: 3, minClientProtocol: 1 }, client: { protocol: 1 }, runs: 0, expect: { ok: true, samePid: true } },
  ];
  const out = [];
  for (const c of cases) {
    const cfg = newState("vs", c.sup);
    try {
      const first = await cli(cfg, "ensure");
      let run = null;
      if (c.runs) run = (await cli(cfg, "run", runArgs(httpRun(await freePort())))).result;
      const got = await cli({ ...cfg, minClientProtocol: 1, ...c.client }, "ensure");
      const samePid = got.ok ? got.supervisorPid === first.supervisorPid : undefined;
      const oldAlive = alive(first.supervisorPid);
      const runAlive = run ? alive(run.pid) : undefined;
      const e = c.expect;
      const pass =
        got.ok === e.ok &&
        (e.code === undefined || got.code === e.code) &&
        (e.samePid === undefined || samePid === e.samePid) &&
        (e.notice === undefined || got.notice === e.notice) &&
        (e.protocol === undefined || got.protocol === e.protocol) &&
        (e.started === undefined || got.started === e.started) &&
        // 报错的两行里，原来的管理进程和它的运行都不许被动
        (e.ok || (oldAlive && runAlive !== false)) &&
        (e.samePid !== false || !oldAlive);
      out.push({ name: c.name, pass, got: { ok: got.ok, code: got.code, notice: got.notice, protocol: got.protocol, started: got.started, samePid, oldAlive, runAlive, ensureMs: got.ensureMs } });
    } finally {
      await cleanupState(cfg);
    }
  }
  return { pass: out.every((c) => c.pass), cases: out };
}
