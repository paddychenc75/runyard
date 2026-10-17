import { join } from "node:path";
import { absPath } from "@runyard/platform";
import type { LogEntry, RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { cliOwner, RunWorld } from "./run-harness.test.ts";

// 命令行（`runyard run`）启动的服务保存后重启（规格 templates/runners 的 TEMPLATES-RUNNERS-36、37，
// 监听何时结束同脚本，见 run/scripts 的 RUN-SCRIPTS-29 至 31；#297）。
// 标签页持有的服务在 live-results.test.ts；这里持有者是命令行。

const MIN = 60_000;

async function setup(
  watch: Record<string, unknown> = { mode: "restart", paths: ["**/*.js"], debounceMs: 300 },
) {
  const w = new RunWorld();
  w.withLogs = true;
  w.serverWatch = watch;
  await w.start();
  const cli = await w.client(false);
  const app = await w.app();
  const created = await w.create(cli, "demo", {});
  // 每次启动数一次：重启之后的“新内容”就是更大的序号
  const launches: number[] = [];
  w.world.fake.processes.when(
    (spec) => spec.argv[1] === "server.js" && spec.cwd === absPath(join("/work", "demo")),
    (spec) => {
      launches.push(launches.length + 1);
      return {
        listenOn: { port: Number(spec.argv[2]), atMs: 100 },
        output: [{ atMs: 10, stream: "stdout", data: `v${launches.length}\n` }],
      };
    },
  );
  return { w, cli, app, launches, id: created.playground.id, folder: created.playground.path };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const runsOf = async (ctx: Ctx) =>
  (await ctx.app.result<RunSnapshot[]>("run.list")).filter((run) => run.playgroundId === ctx.id);

const save = (ctx: Ctx, text: string) =>
  ctx.w.fs.writeFile(absPath(join(ctx.folder, "server.js")), text);

async function advance(w: RunWorld, ms: number): Promise<void> {
  const end = w.clock.now() + ms;
  while (w.clock.now() < end) {
    await w.clock.advance(Math.min(60_000, end - w.clock.now()));
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  }
}

async function settle(ctx: Ctx): Promise<void> {
  await advance(ctx.w, 2_000);
  await new Promise((resolve) => setTimeout(resolve, 5));
}

const statesSince = (ctx: Ctx, from: number): string[] =>
  ctx.app.events
    .slice(from)
    .filter((e) => e.event === "run.state")
    .map((e) => (e.data as { run: RunSnapshot }).run.state);

async function startReady(ctx: Ctx): Promise<RunSnapshot> {
  const run = await ctx.w.startRun(ctx.cli, ctx.id, cliOwner);
  await ctx.w.ready(ctx.app, run.runId);
  return run;
}

describe("命令行启动的服务保存后重启", { timeout: 30_000 }, () => {
  it("[TEMPLATES-RUNNERS-36] runyard run 起的服务保存后：reloading 再 ready，同一个端口，旧进程已结束，日志里有 RELOADING", async () => {
    const ctx = await setup();
    const run = await startReady(ctx);
    const port = (await ctx.app.result<RunSnapshot>("run.get", { runId: run.runId })).port;
    expect(port).toBeDefined();
    const before = ctx.app.events.length;
    save(ctx, "// 新的返回内容");
    await ctx.w.until(async () => statesSince(ctx, before).includes("reloading"));
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, run.runId)) === "ready");
    expect(statesSince(ctx, before)).toEqual(["reloading", "ready"]);
    expect((await ctx.app.result<RunSnapshot>("run.get", { runId: run.runId })).port).toBe(port);
    expect(await runsOf(ctx)).toHaveLength(1);
    // 旧进程树整棵结束：只剩重启后的这一个服务进程
    expect(ctx.launches).toHaveLength(2);
    expect(ctx.w.world.fake.processes.alive().length).toBe(1);
    const read = await ctx.cli.result<{ entries: LogEntry[] }>("logs.read", { playground: ctx.id });
    expect(read.entries.some((e) => e.kind === "system" && e.notice.code === "RELOADING")).toBe(
      true,
    );
    await ctx.w.dispose();
  });

  it("[TEMPLATES-RUNNERS-37] 保存后等回到 ready，监听到的是重新启动的新进程（内容以新进程为准）", async () => {
    const ctx = await setup();
    const run = await startReady(ctx);
    expect(ctx.launches).toHaveLength(1);
    save(ctx, "// v2");
    await ctx.w.until(async () => ctx.launches.length === 2);
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, run.runId)) === "ready");
    expect(ctx.launches).toHaveLength(2);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-29] runyard stop 之后不再监听：保存不重启", async () => {
    const ctx = await setup();
    await startReady(ctx);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    await ctx.cli.result("run.stop", { playground: ctx.id });
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    save(ctx, "// edited");
    await settle(ctx);
    expect(ctx.launches).toHaveLength(1);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-31] 监听空闲满 30 分钟后不再监听", async () => {
    const ctx = await setup();
    await startReady(ctx);
    await advance(ctx.w, 31 * MIN);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("运行器的 watch.mode 为 none（前端开发服务器）：命令行起的服务保存后不重启", async () => {
    const ctx = await setup({ mode: "none" });
    const run = await startReady(ctx);
    const before = ctx.app.events.length;
    save(ctx, "// edited");
    await settle(ctx);
    expect(statesSince(ctx, before)).not.toContain("reloading");
    expect(await ctx.w.stateOf(ctx.app, run.runId)).toBe("ready");
    await ctx.w.dispose();
  });
});
