import { join } from "node:path";
import { absPath } from "@runyard/platform";
import type { LogEntry, RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { cliOwner, RunWorld, tabOwner } from "./run-harness.test.ts";

// 脚本项目保存后自动重新运行的监听何时开始、何时结束（规格 run/scripts 的 RUN-SCRIPTS-27 到 34）。
// 脚本每次启动打印 v<序号> 然后很快跑完，所以“新内容”就是更大的序号。RUN-SCRIPTS-32（桌面应用的标签页）在 M2。

const MIN = 60_000;

async function setup(prepare?: (w: RunWorld) => void) {
  const w = new RunWorld();
  w.withLogs = true;
  await w.start();
  const cli = await w.client(false);
  const app = await w.app();
  const created = await w.create(cli, "demo", { template: "script" });
  let launches = 0;
  w.world.fake.processes.when(["node", "script.js"], () => {
    launches += 1;
    return {
      output: [{ atMs: 10, stream: "stdout", data: `v${launches}\n` }],
      exit: { afterMs: 100, code: 0 },
    };
  });
  prepare?.(w);
  return { w, cli, app, id: created.playground.id, folder: created.playground.path };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const runsOf = async (ctx: Ctx) =>
  (await ctx.app.result<RunSnapshot[]>("run.list")).filter((run) => run.playgroundId === ctx.id);

/** 命令行跑一次脚本并等它结束 */
async function runOnce(ctx: Ctx): Promise<RunSnapshot> {
  const run = await ctx.w.startRun(ctx.cli, ctx.id, cliOwner);
  await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, run.runId)) === "finished");
  return run;
}

/** 保存脚本文件 */
const save = (ctx: Ctx, text: string) =>
  ctx.w.fs.writeFile(absPath(join(ctx.folder, "index.js")), text);

/** 假时间推进 ms，每一步让出几轮事件循环（到点要读设置） */
async function advance(w: RunWorld, ms: number): Promise<void> {
  const end = w.clock.now() + ms;
  while (w.clock.now() < end) {
    await w.clock.advance(Math.min(60_000, end - w.clock.now()));
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  }
}

/** 保存之后给去抖和检查足够的假时间，再看有没有新的运行 */
async function settle(ctx: Ctx): Promise<void> {
  await advance(ctx.w, 2_000);
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function logLines(ctx: Ctx): Promise<string[]> {
  const read = await ctx.cli.result<{ entries: LogEntry[] }>("logs.read", { playground: ctx.id });
  return read.entries.flatMap((entry) => (entry.kind === "stdout" ? [entry.text.trim()] : []));
}

describe("脚本项目的自动重新运行监听", { timeout: 30_000 }, () => {
  it("[RUN-SCRIPTS-27] 命令行运行之后开始监听：脚本跑完后保存，产生新的运行，输出是新内容", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    save(ctx, "// edited");
    await ctx.w.until(async () => (await runsOf(ctx)).length === 2);
    await ctx.w.until(async () => (await runsOf(ctx)).every((run) => run.state === "finished"));
    expect((await logLines(ctx)).at(-1)).toBe("v2");
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-28] 没有运行过的项目不被监听：保存不产生运行", async () => {
    const ctx = await setup();
    save(ctx, "// edited");
    await settle(ctx);
    expect(await runsOf(ctx)).toEqual([]);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-29] runyard stop 之后不再监听", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    await ctx.cli.result("run.stop", { playground: ctx.id });
    save(ctx, "// edited");
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(1);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-29] stopAll 也结束监听", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    await ctx.cli.result("run.stopAll", {});
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-30] 移到废纸篓之后对该项目的监听结束，不再产生运行", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    const trashing = ctx.cli.call("playground.trash", { playground: "demo" });
    await ctx.app.waitForEvent("playground.releaseRequested");
    await ctx.app.call("playground.released", { playgroundId: ctx.id });
    expect(await trashing).toMatchObject({ ok: true });
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(1);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-31] 监听空闲满 30 分钟（没有文件变化、没有命令行的命令提到它）之后不再监听，运行不受影响", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    await advance(ctx.w, 29 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    await advance(ctx.w, 2 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    save(ctx, "// edited");
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(1);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-31] 命令行的命令提到它算活动：计时重新开始", async () => {
    const ctx = await setup();
    const run = await runOnce(ctx);
    await advance(ctx.w, 29 * MIN);
    await ctx.cli.result("run.get", { runId: run.runId });
    await advance(ctx.w, 29 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    await advance(ctx.w, 2 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-31] 应用的请求不算活动", async () => {
    const ctx = await setup();
    const run = await runOnce(ctx);
    await advance(ctx.w, 29 * MIN);
    await ctx.app.result("run.get", { runId: run.runId });
    await advance(ctx.w, 2 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-31] 项目文件夹里的文件变化算活动（改的不是被监听的文件类型，不触发重跑）", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    await advance(ctx.w, 29 * MIN);
    ctx.w.fs.writeFile(absPath(join(ctx.folder, "notes.txt")), "x");
    await advance(ctx.w, 29 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    expect(await runsOf(ctx)).toHaveLength(1);
    await advance(ctx.w, 2 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-31] 空闲分钟数取设置 cliIdleStopMinutes", async () => {
    const ctx = await setup();
    await ctx.cli.result("settings.set", { cliIdleStopMinutes: 5 });
    await runOnce(ctx);
    await advance(ctx.w, 6 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-31] 监听结束之后再 runyard run，重新开始监听", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    await advance(ctx.w, 31 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await runOnce(ctx);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-33] 项目的开关关闭：这一次 run 正常运行，保存后不产生新的运行", async () => {
    const ctx = await setup();
    await ctx.cli.result("playground.update", { playground: "demo", scriptAutoRun: false });
    await runOnce(ctx);
    save(ctx, "// edited");
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(1);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-34] 全局设置关闭：这一次 run 正常运行，保存后不产生新的运行", async () => {
    const ctx = await setup();
    await ctx.cli.result("settings.set", { scriptAutoRun: false });
    await runOnce(ctx);
    save(ctx, "// edited");
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(1);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("监听期间保存时旧的还在跑：先停旧的再跑新的，任何时刻只有一个进程", async () => {
    const ctx = await setup();
    ctx.w.world.fake.processes.when(["node", "script.js"], {});
    const first = await ctx.w.startRun(ctx.cli, ctx.id, cliOwner);
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, first.runId)) === "running");
    save(ctx, "// edited");
    await ctx.w.until(async () => (await runsOf(ctx)).length === 2);
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, first.runId)) === "stopped");
    const runs = await runsOf(ctx);
    expect(runs.filter((run) => run.state === "running")).toHaveLength(1);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-29] stop 恰好撞上已触发、排队中的保存重跑：重跑被撤销，不会起新运行也不会重新挂上监听（#153）", async () => {
    const ctx = await setup();
    // 旧进程不响应停止信号，重跑停在“等旧的停掉”这一步，直到宽限期后被强杀
    ctx.w.world.fake.processes.when(["node", "script.js"], { ignoresStop: true });
    const first = await ctx.w.startRun(ctx.cli, ctx.id, cliOwner);
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, first.runId)) === "running");
    save(ctx, "// edited");
    // 只推进到去抖到点：重跑任务已触发，正等旧的停掉、还没起新进程；此刻 stop 插进来
    await ctx.w.clock.advance(300);
    const stopping = ctx.cli.result("run.stop", { playground: ctx.id });
    await settle(ctx);
    await stopping;
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, first.runId)) === "stopped");
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(1);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("标签页持有的脚本运行不开始监听（桌面应用的监听在 M2）", async () => {
    const ctx = await setup();
    const run = await ctx.w.startRun(ctx.app, ctx.id, tabOwner());
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, run.runId)) === "finished");
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("管理进程关闭时监听一并摘掉", async () => {
    const ctx = await setup();
    await runOnce(ctx);
    const watch = ctx.w.module.scriptWatch;
    expect(watch.isWatching(ctx.id)).toBe(true);
    await ctx.w.dispose();
    expect(watch.isWatching(ctx.id)).toBe(false);
  });
});
