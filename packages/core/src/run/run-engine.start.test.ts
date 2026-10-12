import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { cliOwner, createHarness, dir, scriptArgv } from "./run-harness.test.ts";
import { IllegalTransitionError } from "./run-transitions.ts";

const taskRequest = (h: ReturnType<typeof createHarness>) =>
  h.request({ kind: "oneshot", name: "task", playgroundId: "pg-2" });

describe("启动与就绪", () => {
  it("[RUN-LIFECYCLE-01] 服务依次经过 checking、starting 到 ready，每次变化都发 run.state", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 1500 } });
    h.engine.start(h.request());
    await h.settle();
    expect(h.states.map((s) => s.run.state)).toEqual(["checking", "starting"]);
    await h.fake.clock.advance(1500);
    expect(h.states.map((s) => s.run.state)).toEqual(["checking", "starting", "ready"]);
    expect(h.states.map((s) => s.previous)).toEqual([undefined, "checking", "starting"]);
    const ready = h.states.at(-1);
    expect(ready?.run).toMatchObject({ port: 7100, readyMs: expect.any(Number) });
    expect(ready?.runningCount).toBe(1);
  });

  it("准备阶段可以经过 installing", async () => {
    const h = createHarness({
      prepare: async (context, plan) => {
        context.report("installing");
        return { ok: true, plan };
      },
    });
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    h.engine.start(h.request());
    await h.fake.clock.advance(200);
    expect(h.states.map((s) => s.run.state)).toEqual([
      "checking",
      "installing",
      "starting",
      "ready",
    ]);
  });

  it("子进程拿到的环境没有 ELECTRON_RUN_AS_NODE，参数数组原样传递", async () => {
    const h = createHarness({ plan: { env: { ELECTRON_RUN_AS_NODE: "1", KEEP: "yes" } } });
    h.engine.start(h.request());
    await h.settle();
    const spawned = h.fake.processes.spawned[0];
    expect(spawned?.env).toMatchObject({ KEEP: "yes", RUNYARD_RUN_ID: "run-1" });
    expect(spawned?.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it("进程的输出进日志出口，快照的游标随条数增加", async () => {
    const h = createHarness();
    h.script({
      output: [
        { atMs: 10, stream: "stdout", data: "hello\nwor" },
        { atMs: 20, stream: "stdout", data: "ld\n" },
      ],
    });
    const { run } = h.engine.start(h.request());
    await h.fake.clock.advance(50);
    expect(h.logs.map((l) => l.entry)).toMatchObject([
      { kind: "stdout", text: "hello" },
      { kind: "stdout", text: "world" },
    ]);
    expect(run.snapshot().cursor).toBe("run-1:2");
  });
});

describe("重复与并发启动", () => {
  it("[RUN-LIFECYCLE-12] 对 ready 的项目再启动，返回同一个运行并带 alreadyRunning，进程数不变", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    const first = h.engine.start(h.request());
    await h.fake.clock.advance(300);
    expect(first.run.state).toBe("ready");
    const again = h.engine.start(h.request({ owner: cliOwner }));
    expect(again.run).toBe(first.run);
    expect(again.snapshot.runId).toBe(first.snapshot.runId);
    expect(again.snapshot.alreadyRunning).toBe(true);
    expect(first.snapshot.alreadyRunning).toBeUndefined();
    await h.settle();
    expect(h.fake.processes.spawned).toHaveLength(1);
  });

  it("[RUN-LIFECYCLE-13] 同一时刻的两个启动请求只起一个进程树，拿到同一个运行", async () => {
    const h = createHarness();
    const [a, b] = [h.engine.start(h.request()), h.engine.start(h.request({ owner: cliOwner }))];
    expect(b.run).toBe(a.run);
    expect(b.snapshot.alreadyRunning).toBe(true);
    await h.settle();
    expect(h.fake.processes.spawned).toHaveLength(1);
  });

  it("不同项目各有各的运行；结束之后再启动是新的一次运行", async () => {
    const h = createHarness();
    h.script({ exit: { afterMs: 10, code: 0 } }, scriptArgv);
    const a = h.engine.start(h.request({ kind: "oneshot" }));
    const other = h.engine.start(h.request({ playgroundId: "pg-other", kind: "oneshot" }));
    expect(other.run).not.toBe(a.run);
    await h.fake.clock.advance(100);
    expect(a.run.state).toBe("finished");
    const next = h.engine.start(h.request({ kind: "oneshot" }));
    expect(next.run).not.toBe(a.run);
    expect(next.snapshot.alreadyRunning).toBeUndefined();
  });
});

describe("脚本", () => {
  it("[RUN-LIFECYCLE-02] 退出码 0：finished，带退出码和耗时", async () => {
    const h = createHarness();
    h.script({ exit: { afterMs: 500, code: 0 } }, scriptArgv);
    const { run } = h.engine.start(taskRequest(h));
    await h.fake.clock.advance(600);
    expect(run.snapshot()).toMatchObject({ state: "finished", exitCode: 0, durationMs: 500 });
    expect(run.snapshot().port).toBeUndefined();
    expect(h.states.map((s) => s.run.state)).toEqual(["checking", "running", "finished"]);
    expect(h.exits).toEqual([{ runId: run.runId, exitCode: 0 }]);
  });

  it("[RUN-LIFECYCLE-03] 退出码 1：errored，错误是 SCRIPT_ERRORED 并带现场", async () => {
    const h = createHarness();
    h.script(
      {
        output: [{ atMs: 0, stream: "stderr", data: "Traceback\n" }],
        exit: { afterMs: 100, code: 1 },
      },
      scriptArgv,
    );
    const { run } = h.engine.start(taskRequest(h));
    await h.fake.clock.advance(200);
    expect(run.snapshot()).toMatchObject({ state: "errored", exitCode: 1 });
    expect(run.error()).toMatchObject({
      code: "SCRIPT_ERRORED",
      params: { name: "task" },
      cause: { exitCode: 1, outputTail: "Traceback" },
    });
  });

  it("[RUN-LIFECYCLE-24] 脚本跑完不计数：服务 ready、脚本 running 时是 2，脚本以 0 结束后是 1", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    h.script({ exit: { afterMs: 5000, code: 0 } }, scriptArgv);
    const service = h.engine.start(h.request());
    const task = h.engine.start(taskRequest(h));
    await h.fake.clock.advance(1000);
    expect([service.run.state, task.run.state]).toEqual(["ready", "running"]);
    expect(h.engine.runningCount()).toBe(2);
    await h.fake.clock.advance(5000);
    expect(task.run.state).toBe("finished");
    expect(h.engine.runningCount()).toBe(1);
    expect(h.states.at(-1)).toMatchObject({ run: { state: "finished" }, runningCount: 1 });
  });

  it("语法有误之类的失败之外，脚本被外力结束（没有退出码）也是 errored", async () => {
    const h = createHarness();
    h.script({}, scriptArgv);
    const { run } = h.engine.start(taskRequest(h));
    await h.settle();
    h.fake.processes.exit(h.fake.processes.spawned[0]?.ref ?? { pid: 0, startTime: 0 }, null);
    await h.settle();
    expect(run.snapshot()).toMatchObject({ state: "errored" });
    expect(run.snapshot().exitCode).toBeUndefined();
  });
});

describe("失败与崩溃", () => {
  it.each(["TOOL_MISSING", "TOOL_TOO_OLD", "SETUP_FAILED", "DEPS_OFFLINE"] as const)(
    "准备阶段报告 %s：进入 failed，原因写进快照，项目文件原样保留，不启动进程",
    async (code) => {
      const failure =
        code === "TOOL_MISSING"
          ? { code, params: { tool: "go", required: ">=1.22" } }
          : code === "TOOL_TOO_OLD"
            ? { code, params: { tool: "go", required: ">=1.22", found: "1.20" } }
            : { code, params: { name: "demo" } };
      const h = createHarness({
        prepare: async () => ({ ok: false, failure: { ...failure, debug: "x" } as never }),
      });
      h.fake.fs.writeFile(absPath(`${dir}/main.go`), "package main");
      const { run } = h.engine.start(h.request());
      await h.settle();
      expect(run.snapshot()).toMatchObject({ state: "failed", reason: code });
      expect(run.error()?.code).toBe(code);
      expect(h.fake.fs.exists(absPath(`${dir}/main.go`))).toBe(true);
      expect(h.fake.processes.spawned).toHaveLength(0);
      expect(h.exits).toEqual([{ runId: run.runId, reason: code }]);
    },
  );

  it("[RUN-LIFECYCLE-08] 就绪之前进程退出：failed，RUN_FAILED，现场带退出码和输出末尾", async () => {
    const h = createHarness();
    h.script({
      output: [{ atMs: 0, stream: "stderr", data: "Error: boom\n" }],
      exit: { afterMs: 200, code: 3 },
    });
    const { run } = h.engine.start(h.request());
    await h.fake.clock.advance(500);
    expect(run.snapshot()).toMatchObject({ state: "failed", reason: "RUN_FAILED" });
    expect(run.error()).toMatchObject({
      code: "RUN_FAILED",
      params: { name: "demo" },
      cause: { exitCode: 3, outputTail: "Error: boom" },
    });
  });

  it("[RUN-LIFECYCLE-09] ready 之后进程自己退出：crashed，不自动重启", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 }, exit: { afterMs: 1000, code: 139 } });
    const { run } = h.engine.start(h.request());
    await h.fake.clock.advance(500);
    expect(run.state).toBe("ready");
    await h.fake.clock.advance(600_000);
    expect(run.snapshot()).toMatchObject({ state: "crashed", exitCode: 139 });
    expect(h.fake.processes.spawned).toHaveLength(1);
    expect(h.engine.runningCount()).toBe(0);
  });

  it("崩溃后留在树里的后代被一起结束", async () => {
    const h = createHarness();
    h.script({
      listenOn: { port: 7100, atMs: 100 },
      exit: { afterMs: 1000, code: 1 },
      children: [{ atMs: 0 }],
    });
    h.engine.start(h.request());
    await h.fake.clock.advance(2000);
    expect(h.fake.processes.alive()).toEqual([]);
  });

  it("进程号被复用：根进程已死、同一个 pid 换成别的进程时，清理不碰它", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    h.engine.start(h.request());
    await h.fake.clock.advance(300);
    const ref = h.fake.processes.spawned[0]?.ref;
    if (ref === undefined) throw new Error("没有启动");
    h.fake.processes.exit(ref, 1);
    const foreign = h.fake.processes.addForeign({ pid: ref.pid, startTime: ref.startTime + 1 });
    await h.fake.clock.advance(100);
    expect(h.fake.processes.isAlive(foreign)).toBe(true);
  });
});

describe("启动较慢", () => {
  it("[RUN-LIFECYCLE-10] 超过 30 秒没就绪：状态仍是 starting，只标较慢；进程退出才变 failed", async () => {
    const h = createHarness();
    h.script({ exit: { afterMs: 45_000, code: 1 } });
    const { run } = h.engine.start(h.request());
    await h.fake.clock.advance(29_999);
    expect(run.isSlow()).toBe(false);
    await h.fake.clock.advance(1);
    expect(run.state).toBe("starting");
    expect(run.isSlow()).toBe(true);
    expect(h.slows).toHaveLength(1);
    expect(h.fake.processes.alive()).toHaveLength(1);
    await h.fake.clock.advance(15_000);
    expect(run.snapshot()).toMatchObject({ state: "failed", reason: "RUN_FAILED" });
  });

  it("按时就绪就不标较慢，也不留定时器", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    const { run } = h.engine.start(h.request());
    await h.fake.clock.advance(1000);
    expect(run.state).toBe("ready");
    await h.fake.clock.advance(60_000);
    expect(run.isSlow()).toBe(false);
    expect(h.slows).toEqual([]);
  });
});

describe("状态机守卫", () => {
  it("非法转移被拒绝：starting 时不能结束重载，ready 与 reloading 可以来回", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 500 } });
    const { run } = h.engine.start(h.request());
    await h.fake.clock.advance(100);
    expect(run.state).toBe("starting");
    expect(() => run.endReload()).toThrow(IllegalTransitionError);
    expect(() => run.beginReload()).toThrow(IllegalTransitionError);
    expect(run.state).toBe("starting");
    await h.fake.clock.advance(1000);
    run.beginReload();
    expect(run.state).toBe("reloading");
    run.endReload();
    expect(run.state).toBe("ready");
    expect(
      h.logs.some((l) => l.entry.kind === "system" && l.entry.notice.code === "RELOADING"),
    ).toBe(true);
  });
});
