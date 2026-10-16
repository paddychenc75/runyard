import { absPath } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { cliOwner, createHarness, dir } from "./run-harness.test.ts";

// 进程起来的通知（管理进程据此写运行记录）和崩溃后清理出来的 crashed 运行（规格 SUPERVISOR-LIFECYCLE-16、17）。

describe("进程起来的通知", () => {
  it("起进程时带上进程身份（pid 加启动时间）、命令、工作目录、端口和持有者", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    const { run } = h.engine.start(h.request({ owner: cliOwner }));
    await h.fake.clock.advance(300);

    expect(h.spawned).toHaveLength(1);
    const [event] = h.spawned;
    const alive = h.fake.processes.alive()[0];
    expect(event).toMatchObject({ runId: run.runId, owner: cliOwner });
    expect(event?.ref).toEqual(alive);
    expect(event?.plan).toMatchObject({ argv: ["node", "server.js"], cwd: dir, port: 7100 });
  });
});

describe("崩溃后清理出来的运行", () => {
  const input = (runId = "run-old-1") => ({
    runId,
    request: { playgroundId: "pg-old", name: "old", kind: "server" as const, owner: cliOwner },
    plan: {
      argv: ["node", "server.js"],
      cwd: absPath("/work/old"),
      env: {},
      stdin: false,
      stop: { mode: "graceful" as const, graceMs: 2000 },
      port: 7200,
      url: "http://127.0.0.1:7200",
    },
    pid: 4321,
    startedAt: 1000,
    endedAt: 5000,
  });

  it("引擎里有一个 crashed 的运行：说得出 pid、端口和耗时，不计入运行中，停止是空操作", async () => {
    const h = createHarness();
    const restored = h.engine.restoreCrashed(input());

    expect(h.engine.get("run-old-1")).toBe(restored);
    expect(h.engine.current("pg-old")).toBe(restored);
    expect(restored.snapshot()).toMatchObject({
      state: "crashed",
      pid: 4321,
      port: 7200,
      url: "http://127.0.0.1:7200",
      durationMs: 4000,
      owner: cliOwner,
    });
    expect(h.engine.runningCount()).toBe(0);
    expect((await restored.stop()).state).toBe("crashed");
    expect(h.fake.processes.spawned).toEqual([]);
  });

  it("同一个项目可以照常启动新的运行（不重新接管旧的）", async () => {
    const h = createHarness();
    h.engine.restoreCrashed(input());
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    const started = h.engine.start(h.request({ playgroundId: "pg-old", name: "old" }));
    expect(started.snapshot.alreadyRunning).toBeUndefined();
    expect(started.run.runId).not.toBe("run-old-1");
    await h.fake.clock.advance(300);
    expect(started.run.state).toBe("ready");
  });
});
