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

  it("端口 3 秒内仍没空出来：stop 照样返回（不无限等）", async () => {
    const { h, run } = await readyServer({}, { portReleaseDelayMs: 10_000 });
    const stopped = run.stop();
    await h.fake.clock.advance(3000);
    expect((await stopped).state).toBe("stopped");
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
