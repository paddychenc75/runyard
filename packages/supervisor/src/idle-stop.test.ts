import { absPath } from "@runyard/platform";
import type { LogEntry, RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { cliOwner, RunWorld, tabOwner } from "./run-harness.test.ts";

// 命令行持有的运行空闲后自动停止（规格 run/ownership 的空闲停止一节）。全部用假时钟：
// 每个检查点之间按 30 秒一步推进，并在每一步之后让出真实的 I/O（到点时要读设置）。

const MIN = 60_000;

async function setup(options: { script?: boolean } = {}) {
  const w = new RunWorld();
  w.withLogs = true;
  await w.start();
  const cli = await w.client(false);
  const app = await w.app();
  const created = await w.create(cli, "demo", options.script ? { template: "script" } : {});
  return { w, cli, app, id: created.playground.id, folder: created.playground.path };
}

/** 假时间推进到起点之后的 offsetMs（起点是启动运行的那一刻） */
async function advanceTo(w: RunWorld, origin: number, offsetMs: number): Promise<void> {
  while (w.clock.now() < origin + offsetMs) {
    await w.clock.advance(Math.min(30_000, origin + offsetMs - w.clock.now()));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

async function startServer(
  ctx: Awaited<ReturnType<typeof setup>>,
  behavior: Parameters<RunWorld["server"]>[1] = {},
) {
  const { w, cli, id } = ctx;
  w.server(undefined, behavior);
  const origin = w.clock.now();
  const run = await w.startRun(cli, id, cliOwner);
  await w.ready(cli, run.runId);
  return { run, origin };
}

// 用应用的连接查状态：命令行发的 run.get 本身就是“命令提到它”，会把计时归零
const stateOf = (ctx: Awaited<ReturnType<typeof setup>>, runId: string) =>
  ctx.w.stateOf(ctx.app, runId);

describe("命令行持有的运行空闲后自动停止", () => {
  it("[RUN-OWNERSHIP-09] 30 分钟没有任何活动：按正常流程停止，日志加系统提示，run.exit 带 reason idle", async () => {
    const ctx = await setup();
    const { w, cli, app, id } = ctx;
    const { run, origin } = await startServer(ctx);

    await advanceTo(w, origin, 30 * MIN - 5_000);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 30 * MIN + 5_000);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");

    const exit = (await app.waitForEvent("run.exit")) as { runId: string; reason?: string };
    expect(exit).toMatchObject({ runId: run.runId, reason: "idle" });
    const read = await cli.result<{ entries: LogEntry[] }>("logs.read", { playground: id });
    const notices = read.entries.flatMap((e) => (e.kind === "system" ? [e.notice] : []));
    expect(notices).toContainEqual({ code: "IDLE_STOPPED", params: { minutes: 30 } });
    // 端口随进程树一起释放
    expect(await w.world.fake.platform.ports.isFree(w.portOf(id))).toBe("free");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-10] 过了 29 分钟进程打印一行：计时重新开始，再满 30 分钟才停止", async () => {
    const ctx = await setup();
    const { w } = ctx;
    const { run, origin } = await startServer(ctx, {
      output: [{ atMs: 29 * MIN, stream: "stdout", data: "tick\n" }],
    });

    await advanceTo(w, origin, 30 * MIN + 5_000);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 59 * MIN - 5_000);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 59 * MIN + 10_000);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-11] 过了 29 分钟命令行执行 logs：计时重新开始", async () => {
    const ctx = await setup();
    const { w, cli } = ctx;
    const { run, origin } = await startServer(ctx);

    await advanceTo(w, origin, 29 * MIN);
    await cli.result("logs.read", { playground: "demo" });
    await advanceTo(w, origin, 30 * MIN + 5_000);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 59 * MIN + 10_000);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");
    await w.dispose();
  });

  it("命令行对它执行 run 或 get 也算命令提到它，应用发的同样请求不算", async () => {
    const ctx = await setup();
    const { w, cli, app } = ctx;
    const { run, origin } = await startServer(ctx);

    await advanceTo(w, origin, 20 * MIN);
    await app.result("run.get", { runId: run.runId });
    await app.result("logs.read", { playground: "demo" });
    await advanceTo(w, origin, 29 * MIN);
    await cli.result("run.get", { runId: run.runId });
    await advanceTo(w, origin, 30 * MIN + 5_000);
    // 应用的请求没把计时归零，但 29 分钟那次命令行的 run.get 归了零
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await w.dispose();
  });

  it("项目里的文件有变化也算活动", async () => {
    const ctx = await setup();
    const { w, folder } = ctx;
    const { run, origin } = await startServer(ctx);

    await advanceTo(w, origin, 29 * MIN);
    w.world.fake.fs.writeFile(absPath(`${folder}/index.js`), "// edited\n");
    await advanceTo(w, origin, 30 * MIN + 5_000);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 59 * MIN + 10_000);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-12] 应用里一直开着查看它的标签页，没有其他活动：满 30 分钟仍然被停止", async () => {
    const ctx = await setup();
    const { w, app } = ctx;
    const { run, origin } = await startServer(ctx);

    await app.result("run.attach", { runId: run.runId, clientId: "app-1" });
    // 标签页每分钟刷新一次这次运行的状态和日志，都不是活动
    for (let minute = 1; minute < 30; minute++) {
      await advanceTo(w, origin, minute * MIN);
      await app.result("run.get", { runId: run.runId });
    }
    await advanceTo(w, origin, 30 * MIN + 5_000);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-13] 外部客户端保持着到端口的连接：每 60 秒采样到，不停止；连接断开后再满 30 分钟才停止", async () => {
    const ctx = await setup();
    const { w, id } = ctx;
    const { run, origin } = await startServer(ctx);
    const port = w.portOf(id);
    const { ports } = w.world.fake;
    const occupant = { pid: 1, name: "node", connections: 1 };

    ports.occupy(port, occupant);
    await advanceTo(w, origin, 31 * MIN);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 60 * MIN);
    expect(await stateOf(ctx, run.runId)).toBe("ready");

    ports.occupy(port, { ...occupant, connections: 0 });
    // 最后一次采样到连接不晚于断开时刻，所以最迟在断开后 31 分钟停止
    await advanceTo(w, origin, 60 * MIN + 29 * MIN);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 60 * MIN + 31 * MIN);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-14] 设置 cliIdleStopMinutes 改为 10：空闲满 10 分钟就停止，日志里记的是 10 分钟", async () => {
    const ctx = await setup();
    const { w, cli, app, id } = ctx;
    await app.result("settings.set", { cliIdleStopMinutes: 10 });
    const { run, origin } = await startServer(ctx);

    await advanceTo(w, origin, 10 * MIN - 5_000);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await advanceTo(w, origin, 10 * MIN + 5_000);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");
    const read = await cli.result<{ entries: LogEntry[] }>("logs.read", { playground: id });
    expect(read.entries).toContainEqual(
      expect.objectContaining({ notice: { code: "IDLE_STOPPED", params: { minutes: 10 } } }),
    );
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-15] 标签页持有的运行没有任何活动：满 30 分钟仍然 ready", async () => {
    const ctx = await setup();
    const { w, app, id } = ctx;
    w.server(undefined);
    const origin = w.clock.now();
    const run = await w.startRun(app, id, tabOwner());
    await w.ready(app, run.runId);

    await advanceTo(w, origin, 90 * MIN);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await w.dispose();
  });

  it("改为由我管理之后不再做空闲停止", async () => {
    const ctx = await setup();
    const { w, app } = ctx;
    const { run, origin } = await startServer(ctx);

    await advanceTo(w, origin, 10 * MIN);
    await app.result("run.adopt", { runId: run.runId, owner: tabOwner("app-1", "t9") });
    await advanceTo(w, origin, 60 * MIN);
    expect(await stateOf(ctx, run.runId)).toBe("ready");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-16] 命令行持有的脚本跑完：状态 finished，不触发空闲停止", async () => {
    const ctx = await setup({ script: true });
    const { w, cli, app, id } = ctx;
    w.world.fake.processes.when(["node", "script.js"], { exit: { afterMs: 1_000, code: 0 } });
    const origin = w.clock.now();
    const run = await w.startRun(cli, id, cliOwner);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "finished");

    await advanceTo(w, origin, 40 * MIN);
    expect(await stateOf(ctx, run.runId)).toBe("finished");
    const exits = app.eventsOf("run.exit") as { runId: string; reason?: string }[];
    expect(exits.filter((e) => e.runId === run.runId).every((e) => e.reason === undefined)).toBe(
      true,
    );
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-16] 命令行持有的脚本还在跑：超过 30 分钟也不被空闲停止", async () => {
    const ctx = await setup({ script: true });
    const { w, cli, id } = ctx;
    w.world.fake.processes.when(["node", "script.js"], {});
    const origin = w.clock.now();
    const run = await w.startRun(cli, id, cliOwner);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "running");

    await advanceTo(w, origin, 45 * MIN);
    expect(await stateOf(ctx, run.runId)).toBe("running");
    await w.dispose();
  });

  it("[RUN-OWNERSHIP-17] 过了 29 分钟标签页 attach：持有者不变，计时不归零，1 分钟后仍被停止", async () => {
    const ctx = await setup();
    const { w, app } = ctx;
    const { run, origin } = await startServer(ctx);

    await advanceTo(w, origin, 29 * MIN);
    await app.result("run.attach", { runId: run.runId, clientId: "app-1" });
    const snapshot = await app.result<RunSnapshot>("run.get", { runId: run.runId });
    expect(snapshot.owner).toEqual(cliOwner);
    await advanceTo(w, origin, 30 * MIN + 5_000);
    await w.until(async () => (await stateOf(ctx, run.runId)) === "stopped");
    await w.dispose();
  });
});
