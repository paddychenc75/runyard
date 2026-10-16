import { absPath } from "@runyard/platform";
import { describe, expect, it, vi } from "vitest";
import { cliOwner, createHarness, scriptArgv, tabOwner } from "./run-harness.test.ts";

// 一个 ready 的服务，端口 7100
async function readyServer(options: Parameters<typeof createHarness>[0] = {}, behavior = {}) {
  const h = createHarness(options);
  h.script({ listenOn: { port: 7100, atMs: 100 }, ...behavior });
  const started = h.engine.start(h.request());
  await h.fake.clock.advance(300);
  expect(started.run.state).toBe("ready");
  return { h, run: started.run };
}

describe("停止整棵进程树", () => {
  it("[RUN-LIFECYCLE-14] 有子进程和孙进程的服务：stop 返回时整棵树为空，端口已可绑定", async () => {
    const { h, run } = await readyServer(
      {},
      { portReleaseDelayMs: 1000, children: [{ atMs: 0, behavior: { children: [{ atMs: 0 }] } }] },
    );
    expect(h.fake.processes.alive()).toHaveLength(3);
    let returned = false;
    const stopped = run.stop().then((snapshot) => {
      returned = true;
      return snapshot;
    });
    await h.fake.clock.advance(500);
    expect(returned).toBe(false); // 端口还没空出来，stop 不能先返回
    await h.fake.clock.advance(500);
    const snapshot = await stopped;
    expect(snapshot.state).toBe("stopped");
    expect(h.fake.processes.alive()).toEqual([]);
    expect(await h.fake.platform.ports.isFree(7100)).toBe("free");
    expect(h.states.slice(-2).map((s) => s.run.state)).toEqual(["stopping", "stopped"]);
    expect(h.engine.runningCount()).toBe(0);
  });

  it("[RUN-LIFECYCLE-15] 进程忽略终止请求：等满 graceMs 才强制结束，stop 返回时树为空", async () => {
    const { h, run } = await readyServer(
      { plan: { stop: { mode: "graceful", graceMs: 2000 } } },
      {
        ignoresStop: true,
        children: [{ atMs: 0, behavior: { ignoresStop: true } }],
      },
    );
    const terminate = vi.spyOn(h.fake.platform.proc, "terminate");
    let returned = false;
    const stopped = run.stop().then(() => {
      returned = true;
    });
    await h.fake.clock.advance(1999);
    expect(returned).toBe(false);
    expect(h.fake.processes.alive()).toHaveLength(2);
    await h.fake.clock.advance(1);
    await stopped;
    expect(h.fake.processes.alive()).toEqual([]);
    expect(terminate.mock.calls[0]?.[1]).toEqual({ mode: "graceful", graceMs: 2000 });
  });

  it("运行器声明的 graceMs 和 interrupt 方式原样交给平台层", async () => {
    const { h, run } = await readyServer(
      { plan: { stop: { mode: "interrupt", graceMs: 500 } } },
      {
        ignoresStop: true,
      },
    );
    const terminate = vi.spyOn(h.fake.platform.proc, "terminate");
    const stopped = run.stop();
    await h.fake.clock.advance(499);
    expect(h.fake.processes.alive()).toHaveLength(1);
    await h.fake.clock.advance(1);
    await stopped;
    expect(terminate.mock.calls[0]).toEqual([
      expect.anything(),
      { mode: "interrupt", graceMs: 500 },
    ]);
  });

  it("平台层返回后树里仍有成员：整棵强制结束，stop 才返回", async () => {
    const { h, run } = await readyServer({}, { children: [{ atMs: 0 }] });
    vi.spyOn(h.fake.platform.proc, "terminate").mockImplementationOnce(async () => undefined);
    await run.stop();
    expect(h.fake.processes.alive()).toEqual([]);
  });

  it("[RUN-LIFECYCLE-16] 后代拿着输出管道不放：根进程退出后 stop 仍然返回", async () => {
    const { h, run } = await readyServer({}, { children: [{ atMs: 0, holdsOutputPipe: true }] });
    const snapshot = await run.stop();
    expect(snapshot.state).toBe("stopped");
    expect(h.fake.processes.alive()).toEqual([]);
  });

  it("[RUN-LIFECYCLE-16] 脚本自己结束时后代还拿着管道：照样 finished，不等管道关闭", async () => {
    const h = createHarness();
    h.script(
      { exit: { afterMs: 100, code: 0 }, children: [{ atMs: 0, holdsOutputPipe: true }] },
      scriptArgv,
    );
    const { run } = h.engine.start(h.request({ kind: "oneshot" }));
    await h.fake.clock.advance(200);
    expect(run.state).toBe("finished");
    expect(h.fake.processes.alive()).toEqual([]);
  });

  it("端口 3 秒内仍没空出来：stop 照样返回（不无限等），并留下 PORT_NOT_RELEASED 提示", async () => {
    const { h, run } = await readyServer({}, { portReleaseDelayMs: 10_000 });
    const stopped = run.stop();
    await h.fake.clock.advance(3000);
    expect((await stopped).state).toBe("stopped");
    const notices = h.logs.flatMap((l) => (l.entry.kind === "system" ? [l.entry.notice] : []));
    expect(notices).toContainEqual({
      code: "PORT_NOT_RELEASED",
      params: { port: 7100, waitedMs: 3000, limitMs: 3000 },
    });
  });

  it("端口按时空出来：没有 PORT_NOT_RELEASED 提示", async () => {
    const { h, run } = await readyServer({}, { portReleaseDelayMs: 1000 });
    const stopped = run.stop();
    await h.fake.clock.advance(1000);
    await stopped;
    const codes = h.logs.flatMap((l) => (l.entry.kind === "system" ? [l.entry.notice.code] : []));
    expect(codes).not.toContain("PORT_NOT_RELEASED");
  });

  it("停止中再停止返回同一个结果；对已结束的运行停止原样返回", async () => {
    const { h, run } = await readyServer({}, { stopDelayMs: 500 });
    const first = run.stop();
    const second = run.stop();
    expect(second).toBe(first);
    await h.fake.clock.advance(500);
    const done = await first;
    expect(done.state).toBe("stopped");
    expect(await run.stop()).toEqual(done);
    expect(h.exits).toHaveLength(1);
  });

  it("准备阶段被停止：不启动进程，直接 stopped，临时目录被清掉", async () => {
    const tempDir = absPath("/fake/tmp/run-1");
    const h = createHarness({
      prepare: (context, plan) =>
        new Promise((resolve) => {
          context.signal.addEventListener("abort", () =>
            resolve({ ok: true, plan: { ...plan, tempDir } }),
          );
        }),
    });
    const { run } = h.engine.start(h.request());
    await h.settle();
    expect(run.state).toBe("checking");
    const snapshot = await run.stop();
    expect(snapshot.state).toBe("stopped");
    expect(h.fake.processes.spawned).toHaveLength(0);
    expect(h.removed).toEqual([tempDir]);
  });

  it("[RUN-LIFECYCLE-19] Go 脚本用 interrupt 停止，这次运行的临时目录在停止后被删除", async () => {
    const tempDir = absPath("/fake/tmp/go-run-1");
    const engineHarness = createHarness({
      plan: { stop: { mode: "interrupt", graceMs: 2000 }, tempDir },
    });
    engineHarness.fake.fs.writeFile(absPath(`${tempDir}/go-build123/x.o`), "obj");
    engineHarness.script({ listenOn: { port: 7100, atMs: 100 } });
    const { run } = engineHarness.engine.start(engineHarness.request());
    await engineHarness.fake.clock.advance(300);
    expect(engineHarness.fake.fs.exists(absPath(`${tempDir}/go-build123/x.o`))).toBe(true);
    await run.stop();
    expect(engineHarness.removed).toEqual([tempDir]);
    expect(engineHarness.fake.fs.exists(absPath(`${tempDir}/go-build123/x.o`))).toBe(false);
  });

  it("日志里留下“用户停止”的提示，stop 之后没有“进程退出”的提示", async () => {
    const { h, run } = await readyServer();
    await run.stop();
    const codes = h.logs.flatMap((l) => (l.entry.kind === "system" ? [l.entry.notice.code] : []));
    expect(codes).toEqual(["STOPPED_BY_USER"]);
  });
});

describe("脱离进程组的后代", () => {
  // Next 退出时另起的遥测进程：脱离进程组、继承运行标记、最长活 0.95 秒（决策记录 0006）
  const telemetry = (lifeMs?: number) => ({
    children: [
      {
        atMs: 0,
        detached: true,
        ...(lifeMs === undefined ? {} : { behavior: { exit: { afterMs: lifeMs, code: 0 } } }),
      },
    ],
  });

  it("[RUN-LIFECYCLE-20] 停止后带标记的遥测进程还活 0.95 秒：stop 等它自己走掉才返回，没有强制结束它", async () => {
    // readyServer 已推进 300 毫秒，所以从启动算起 1250 毫秒退出，就是停止之后 950 毫秒
    const { h, run } = await readyServer({}, telemetry(1250));
    const terminate = vi.spyOn(h.fake.platform.proc, "terminate");
    let returned = false;
    const stopped = run.stop().then((snapshot) => {
      returned = true;
      return snapshot;
    });
    await h.fake.clock.advance(900);
    expect(returned).toBe(false);
    expect(h.fake.processes.alive()).toHaveLength(1);
    await h.fake.clock.advance(100);
    expect((await stopped).state).toBe("stopped");
    expect(h.fake.processes.alive()).toEqual([]);
    expect(terminate).toHaveBeenCalledTimes(1); // 只有对整棵树的那一次
  });

  it("[RUN-LIFECYCLE-20] 带标记的进程 2 秒后还在：核对身份后结束，stop 在 2 秒时返回", async () => {
    const { h, run } = await readyServer({}, telemetry());
    const [stray] = h.fake.processes.alive().filter((ref) => ref.pid !== run.snapshot().pid);
    expect(stray).toBeDefined();
    const terminate = vi.spyOn(h.fake.platform.proc, "terminate");
    let returned = false;
    const stopped = run.stop().then((snapshot) => {
      returned = true;
      return snapshot;
    });
    await h.fake.clock.advance(1900);
    expect(returned).toBe(false);
    await h.fake.clock.advance(100);
    expect((await stopped).state).toBe("stopped");
    expect(h.fake.processes.alive()).toEqual([]);
    expect(terminate).toHaveBeenCalledWith(stray, { mode: "kill", graceMs: 0 });
  });

  it("[RUN-LIFECYCLE-20] 别的运行的标记不碰：只等本次运行的", async () => {
    const { h, run } = await readyServer();
    const other = h.fake.processes.addForeign({ env: { RUNYARD_RUN_ID: "run-99" } });
    await run.stop();
    expect(h.fake.processes.isAlive(other)).toBe(true);
  });
});

describe("重启与全部停止", () => {
  it("[RUN-LIFECYCLE-22] 重启：旧进程树整棵结束，新进程在同一个端口上 ready", async () => {
    const { h, run } = await readyServer({}, { children: [{ atMs: 0 }] });
    const old = h.fake.processes.alive();
    const restarted = h.engine.restart(run.runId);
    await h.fake.clock.advance(0);
    const next = await restarted;
    await h.fake.clock.advance(300);
    expect(run.state).toBe("stopped");
    expect(old.every((ref) => !h.fake.processes.isAlive(ref))).toBe(true);
    expect(next?.run.runId).not.toBe(run.runId);
    expect(next?.run.snapshot()).toMatchObject({ state: "ready", port: 7100 });
    expect(h.fake.processes.spawned).toHaveLength(2);
  });

  it("[RUN-LIFECYCLE-23] stopAll 带 mine 只停命令行持有的", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    h.script({ exit: { afterMs: 100_000, code: 0 } }, scriptArgv);
    const tab = h.engine.start(h.request({ owner: tabOwner }));
    const cli = h.engine.start(
      h.request({ playgroundId: "pg-2", kind: "oneshot", owner: cliOwner }),
    );
    await h.fake.clock.advance(300);
    const stopped = await h.engine.stopAll({ mine: true });
    expect(stopped.map((s) => s.runId)).toEqual([cli.run.runId]);
    expect(cli.run.state).toBe("stopped");
    expect(tab.run.state).toBe("ready");
    await h.engine.stopAll();
    expect(tab.run.state).toBe("stopped");
  });
});

describe("空闲停止的原因", () => {
  it("带 idle 的 stop：日志是 IDLE_STOPPED，run.exit 带 reason idle，状态照常走到 stopped", async () => {
    const { h, run } = await readyServer();
    const snapshot = await run.stop({ idle: { minutes: 30 } });
    expect(snapshot.state).toBe("stopped");
    const notices = h.logs.flatMap(({ entry }) => (entry.kind === "system" ? [entry.notice] : []));
    expect(notices).toContainEqual({ code: "IDLE_STOPPED", params: { minutes: 30 } });
    expect(notices.some((notice) => notice.code === "STOPPED_BY_USER")).toBe(false);
    expect(h.exits.at(-1)).toMatchObject({ runId: run.runId, reason: "idle" });
    expect(h.states.slice(-2).map((s) => s.run.state)).toEqual(["stopping", "stopped"]);
  });

  it("普通 stop 的 run.exit 没有 reason", async () => {
    const { h, run } = await readyServer();
    await run.stop();
    expect(h.exits.at(-1)?.reason).toBeUndefined();
  });
});

describe("进程自己退出与 stop 交错（议题 #137）", () => {
  it("进程退出后清理后代的 await 期间调用了 stop：不抛 IllegalTransitionError，运行以 stopped 结束", async () => {
    const h = createHarness();
    h.script({ exit: { afterMs: 1000, code: 0 } }, scriptArgv);
    const { run } = h.engine.start(h.request({ kind: "oneshot", owner: cliOwner }));
    await h.fake.clock.advance(100);
    expect(run.state).toBe("running");

    const original = h.fake.platform.proc.members.bind(h.fake.platform.proc);
    let stopped: Promise<unknown> | undefined;
    // 退出的处理第一次问“还有后代吗”时，用户恰好点了停止
    vi.spyOn(h.fake.platform.proc, "members").mockImplementationOnce(async (ref) => {
      stopped = run.stop();
      return original(ref);
    });
    await h.fake.clock.advance(1000);
    await h.fake.clock.advance(3000);
    await stopped;

    expect(run.state).toBe("stopped");
    expect(h.states.map((s) => s.run.state).slice(-2)).toEqual(["stopping", "stopped"]);
    expect(h.exits.filter((e) => e.runId === run.runId)).toHaveLength(1);
  });
});
