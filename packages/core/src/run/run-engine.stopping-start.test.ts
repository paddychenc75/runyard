import { describe, expect, it } from "vitest";
import { createHarness } from "./run-harness.test.ts";

// 上一次运行还在 stopping 时再启动：负责人的决定是等它停完再起新的（CLI-COMMANDS-78），
// 取代 RUN-LIFECYCLE-12 旧写法里“对 stopping 也返回现有运行”（议题 #73）。

describe("在 stopping 时启动", () => {
  it("[CLI-COMMANDS-78] 等旧的停完再起新的：新运行不带 alreadyRunning，任何时刻只有一个进程", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 }, ignoresStop: true });
    const first = h.engine.start(h.request());
    await h.fake.clock.advance(300);
    expect(first.run.state).toBe("ready");

    const stopping = first.run.stop();
    await h.settle();
    expect(first.run.state).toBe("stopping");
    const second = h.engine.start(h.request());
    expect(second.run).not.toBe(first.run);
    expect(second.snapshot.alreadyRunning).toBeUndefined();
    expect(h.engine.current("pg-1")).toBe(second.run);

    await h.fake.clock.advance(1000);
    expect(h.fake.processes.spawned).toHaveLength(1); // 旧的还没停完，新的还没起进程
    expect(second.run.state).toBe("checking");
    await h.fake.clock.advance(1100);
    await stopping;
    h.script({ listenOn: { port: 7100, atMs: 100 } });
    await h.fake.clock.advance(1000);
    expect(first.run.state).toBe("stopped");
    expect(second.run.state).toBe("ready");
    expect(h.fake.processes.alive()).toHaveLength(1);
  });

  it("等待期间调用方撤销新运行（命令行等不到停止完成时用它放弃，CLI-COMMANDS-79）：不会起进程", async () => {
    const h = createHarness();
    h.script({ listenOn: { port: 7100, atMs: 100 }, ignoresStop: true });
    const first = h.engine.start(h.request());
    await h.fake.clock.advance(300);
    const stopping = first.run.stop();
    await h.settle();
    const second = h.engine.start(h.request());
    const secondStopped = second.run.stop();
    await h.fake.clock.advance(5000);
    await stopping;
    expect((await secondStopped).state).toBe("stopped");
    expect(h.fake.processes.spawned).toHaveLength(1);
    expect(h.fake.processes.alive()).toEqual([]);
  });
});
