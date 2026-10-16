import type { RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { cliOwner, RunWorld, tabOwner } from "./run-harness.test.ts";

// 持有者与连接（规格 run/ownership）：标签页持有的运行随应用的连接生灭，命令行持有的不受影响。

async function setup() {
  const w = new RunWorld();
  await w.start();
  const app = await w.app();
  const cli = await w.client(false);
  w.server(undefined);
  return { w, app, cli };
}

describe("标签页持有的运行", () => {
  it("[RUN-OWNERSHIP-01] 关掉正在运行的标签页：3 秒内变为 stopped，端口可重新绑定", async () => {
    const { w, app } = await setup();
    const id = await w.newProject(app, "demo");
    const run = await w.startRun(app, id, tabOwner());
    await w.ready(app, run.runId);
    const port = w.portOf(id);
    expect(await w.world.fake.platform.ports.isFree(port)).toBe("in-use");

    const closedAt = w.clock.now();
    // 应用在用户确认关闭后对这个标签页的运行发 run.stop
    const stopped = await w.drive(app.result<RunSnapshot>("run.stop", { runId: run.runId }));
    expect(stopped.state).toBe("stopped");
    expect(w.clock.now() - closedAt).toBeLessThan(3000);
    expect(await w.world.fake.platform.ports.isFree(port)).toBe("free");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-02] 手动停止后标签页仍开着：再次启动时持有者仍是这个标签页", async () => {
    const { w, app } = await setup();
    const id = await w.newProject(app, "demo");
    const first = await w.startRun(app, id, tabOwner());
    await w.ready(app, first.runId);
    await w.drive(app.result("run.stop", { playground: id }));
    expect(await w.stateOf(app, first.runId)).toBe("stopped");

    const second = await w.startRun(app, id, tabOwner());
    expect(second.runId).not.toBe(first.runId);
    expect(second.owner).toEqual(tabOwner());
    await w.ready(app, second.runId);
    await w.dispose();
  });
});

describe("命令行持有的运行", () => {
  it("[RUN-OWNERSHIP-03] 关闭查看命令行运行的标签页：运行继续，持有者仍是命令行", async () => {
    const { w, app, cli } = await setup();
    const id = await w.newProject(cli, "demo");
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);

    await app.result("run.attach", { runId: run.runId, clientId: "app-1" });
    await app.result("run.detach", { runId: run.runId, clientId: "app-1" });
    await w.clock.advance(10_000);
    const after = await cli.result<RunSnapshot>("run.get", { runId: run.runId });
    expect(after.state).toBe("ready");
    expect(after.owner).toEqual(cliOwner);
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-04] 改为由我管理：持有者变为该标签页，之后随这条连接停止", async () => {
    const { w, app, cli } = await setup();
    const id = await w.newProject(cli, "demo");
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);

    const adopted = await app.result<RunSnapshot>("run.adopt", {
      runId: run.runId,
      owner: tabOwner("app-1", "t9"),
    });
    expect(adopted.owner).toEqual(tabOwner("app-1", "t9"));
    expect((await app.waitForEvent("run.state")) as { run: RunSnapshot }).toBeDefined();

    // 应用被强杀：它名下的这个运行在宽限期后停止
    app.client.destroy();
    await w.connectionsDown(1);
    await w.clock.advance(5000);
    await w.until(async () => (await w.stateOf(cli, run.runId)) === "stopped");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-05] 对命令行持有的运行从标签页启动：返回现有运行，持有者仍是命令行", async () => {
    const { w, app, cli } = await setup();
    const id = await w.newProject(cli, "demo");
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);

    const again = await w.startRun(app, id, tabOwner());
    expect(again.runId).toBe(run.runId);
    expect(again.alreadyRunning).toBe(true);
    expect(again.owner).toEqual(cliOwner);
    expect(w.world.fake.processes.alive()).toHaveLength(1);
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-17] 查看不改变持有者，也不算命令提到它", async () => {
    const { w, app, cli } = await setup();
    const id = await w.newProject(cli, "demo");
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);
    const before = w.mentions.length;

    await app.result("run.attach", { runId: run.runId, clientId: "app-1" });
    await app.result("run.detach", { runId: run.runId, clientId: "app-1" });
    expect(w.mentions.length).toBe(before);
    const running = await app.result<RunSnapshot[]>("run.list", { running: true });
    expect(running[0]?.owner).toEqual(cliOwner);
    expect(w.module.viewers.of(run.runId)).toEqual([]);
    await w.dispose();
  });
});

describe("应用退出与崩溃", () => {
  async function twoTabsAndOneCli() {
    const ctx = await setup();
    const { w, app, cli } = ctx;
    const a = await w.newProject(app, "a");
    const b = await w.newProject(app, "b");
    const c = await w.newProject(cli, "c");
    const runA = await w.startRun(app, a, tabOwner("app-1", "t1"));
    const runB = await w.startRun(app, b, tabOwner("app-1", "t2"));
    const runC = await w.startRun(cli, c, cliOwner);
    for (const run of [runA, runB, runC]) await w.ready(cli, run.runId);
    return { ...ctx, runA, runB, runC };
  }

  it("[RUN-OWNERSHIP-06] 正常退出应用：两个标签页持有的运行 5 秒内停止，命令行持有的仍在 ready", async () => {
    const { w, app, cli, runA, runB, runC } = await twoTabsAndOneCli();
    const byeAt = w.clock.now();
    await w.drive(app.result("session.bye", {}));
    expect(w.clock.now() - byeAt).toBeLessThanOrEqual(5000);
    expect(await w.stateOf(cli, runA.runId)).toBe("stopped");
    expect(await w.stateOf(cli, runB.runId)).toBe("stopped");
    expect(await w.stateOf(cli, runC.runId)).toBe("ready");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-07] 应用被强杀：标签页持有的运行在断开 5 秒之后才停止，命令行持有的继续", async () => {
    const { w, app, cli, runA, runB, runC } = await twoTabsAndOneCli();
    app.client.destroy();
    await w.connectionsDown(1);

    await w.clock.advance(4999);
    expect(await w.stateOf(cli, runA.runId)).toBe("ready");
    await w.clock.advance(1);
    await w.until(async () => (await w.stateOf(cli, runA.runId)) === "stopped");
    await w.until(async () => (await w.stateOf(cli, runB.runId)) === "stopped");
    expect(await w.stateOf(cli, runC.runId)).toBe("ready");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-08] 宽限期内同一个应用重新连上：它名下的运行不被停止", async () => {
    const { w, app, cli, runA } = await twoTabsAndOneCli();
    app.client.destroy();
    await w.connectionsDown(1);
    await w.clock.advance(3000);

    const back = await w.app();
    await w.clock.advance(10_000);
    expect(await w.stateOf(back, runA.runId)).toBe("ready");
    expect(await w.stateOf(cli, runA.runId)).toBe("ready");
    await w.dispose();
  });

  it("宽限期内换了进程号的应用带着同一个 clientId 来请求，也算重连", async () => {
    const { w, app, cli, runA } = await twoTabsAndOneCli();
    app.client.destroy();
    await w.connectionsDown(1);
    await w.clock.advance(2000);

    const back = await w.app(process.pid + 1);
    await back.result("run.attach", { runId: runA.runId, clientId: "app-1" });
    await w.clock.advance(10_000);
    expect(await w.stateOf(cli, runA.runId)).toBe("ready");
    await w.dispose();
  });

  it("session.bye 超过 5 秒还没停完时不再等：照样返回", async () => {
    const w = new RunWorld();
    w.moduleOptions = { byeWaitMs: 1000 };
    await w.start();
    const app = await w.app();
    w.server(undefined, { ignoresStop: true });
    const id = await w.newProject(app, "demo");
    const run = await w.startRun(app, id, tabOwner());
    await w.ready(app, run.runId);

    const byeAt = w.clock.now();
    await w.drive(app.result("session.bye", {}), 100);
    expect(w.clock.now() - byeAt).toBeGreaterThanOrEqual(1000);
    expect(w.clock.now() - byeAt).toBeLessThan(2000);
    await w.dispose();
  });
});
