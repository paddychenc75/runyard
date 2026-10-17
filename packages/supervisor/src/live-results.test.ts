import { join } from "node:path";
import { absPath } from "@runyard/platform";
import type { LogEntry, RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { RunWorld, tabOwner } from "./run-harness.test.ts";

// 编辑器保存后的实时结果里属于管理进程的部分（规格 desktop/editor 的 DESKTOP-EDITOR-48 至 50，
// 以及它们依赖的 run/scripts 的 RUN-SCRIPTS-32、templates/runners 的 TEMPLATES-RUNNERS-36 至 38）：
// 编辑器保存与别的程序写文件没有区别，都是磁盘上的变化；这里用 `fs.writeFile` 模拟写入，
// 桌面应用的标签页持有运行。静态页面的刷新在 static-server.test.ts 和 editor-live-static.platform-dependent.test.ts。

async function setup(kind: "script" | "server", serverWatch?: Record<string, unknown>) {
  const w = new RunWorld();
  w.withLogs = true;
  if (serverWatch !== undefined) w.serverWatch = serverWatch;
  await w.start();
  const app = await w.app();
  const created = await w.create(app, "demo", kind === "script" ? { template: "script" } : {});
  let launches = 0;
  if (kind === "script") {
    w.world.fake.processes.when(["node", "script.js"], () => {
      launches += 1;
      return {
        output: [{ atMs: 10, stream: "stdout", data: `v${launches}\n` }],
        exit: { afterMs: 100, code: 0 },
      };
    });
  } else {
    w.server("demo");
  }
  return { w, app, id: created.playground.id, folder: created.playground.path };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const runsOf = async (ctx: Ctx) =>
  (await ctx.app.result<RunSnapshot[]>("run.list")).filter((run) => run.playgroundId === ctx.id);

const save = (ctx: Ctx, file: string, text: string) =>
  ctx.w.fs.writeFile(absPath(join(ctx.folder, file)), text);

async function advance(w: RunWorld, ms: number): Promise<void> {
  const end = w.clock.now() + ms;
  while (w.clock.now() < end) {
    await w.clock.advance(Math.min(100, end - w.clock.now()));
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  }
}

async function settle(ctx: Ctx): Promise<void> {
  await advance(ctx.w, 2_000);
  await new Promise((resolve) => setTimeout(resolve, 5));
}

/** 从第 from 个事件起收到的运行状态 */
const statesSince = (ctx: Ctx, from: number): string[] =>
  ctx.app.events
    .slice(from)
    .filter((e) => e.event === "run.state")
    .map((e) => (e.data as { run: RunSnapshot }).run.state);

async function stdoutLines(ctx: Ctx): Promise<string[]> {
  const read = await ctx.app.result<{ entries: LogEntry[] }>("logs.read", { playground: ctx.id });
  return read.entries.flatMap((entry) => (entry.kind === "stdout" ? [entry.text.trim()] : []));
}

/** 标签页里运行脚本并等它结束（上一次运行已结束） */
async function runScriptInTab(ctx: Ctx): Promise<RunSnapshot> {
  const run = await ctx.w.startRun(ctx.app, ctx.id, tabOwner());
  await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, run.runId)) === "finished");
  return run;
}

describe("编辑器保存后的实时结果（管理进程一侧）", { timeout: 30_000 }, () => {
  it("[DESKTOP-EDITOR-49] [RUN-SCRIPTS-32] 标签页里的脚本保存后重新运行：输出面板出现新的一次运行和新的输出", async () => {
    const ctx = await setup("script");
    await runScriptInTab(ctx);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    save(ctx, "index.js", "// 改了输出");
    await ctx.w.until(async () => (await runsOf(ctx)).length === 2);
    await ctx.w.until(async () => (await runsOf(ctx)).every((run) => run.state === "finished"));
    // 输出面板读到的是最新一次运行的输出
    expect(await stdoutLines(ctx)).toEqual(["v2"]);
    // 新的运行仍由同一个标签页持有
    expect((await runsOf(ctx)).map((run) => run.owner.kind)).toEqual(["tab", "tab"]);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-32] 关闭标签页（run.stop）之后再保存：不再产生运行", async () => {
    const ctx = await setup("script");
    await runScriptInTab(ctx);
    save(ctx, "index.js", "// 第一次");
    await ctx.w.until(async () => (await runsOf(ctx)).length === 2);
    await ctx.w.until(async () => (await runsOf(ctx)).every((run) => run.state === "finished"));
    await ctx.app.result("run.stop", { playground: ctx.id });
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    save(ctx, "index.js", "// 第二次");
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(2);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-32] 应用告别（退出）之后监听结束，已跑完的脚本也一样", async () => {
    const ctx = await setup("script");
    await runScriptInTab(ctx);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    await ctx.w.drive(ctx.app.result("session.bye", {}));
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(false);
    await ctx.w.dispose();
  });

  it("[RUN-SCRIPTS-32] 标签页持有的监听不计空闲：过了 30 分钟保存仍然重新运行", async () => {
    const ctx = await setup("script");
    await runScriptInTab(ctx);
    await advance(ctx.w, 31 * 60_000);
    expect(ctx.w.module.scriptWatch.isWatching(ctx.id)).toBe(true);
    save(ctx, "index.js", "// 很久以后");
    await ctx.w.until(async () => (await runsOf(ctx)).length === 2);
    await ctx.w.dispose();
  });

  it("[DESKTOP-EDITOR-48] 前端开发服务器保存后不重启：运行 id 和状态不变，没有进入 reloading", async () => {
    // 运行器 watch.mode 为 none（Vite 自己热更新，templates/runners/vite/runner.json）
    const ctx = await setup("server");
    const run = await ctx.w.startRun(ctx.app, ctx.id, tabOwner());
    await ctx.w.ready(ctx.app, run.runId);
    const before = ctx.app.events.length;
    save(ctx, "src/App.tsx", "export default 1");
    await settle(ctx);
    expect(await runsOf(ctx)).toHaveLength(1);
    expect(await ctx.w.stateOf(ctx.app, run.runId)).toBe("ready");
    expect(statesSince(ctx, before)).not.toContain("reloading");
    await ctx.w.dispose();
  });

  it("[DESKTOP-EDITOR-50] 服务保存后重启：经过 reloading 回到 ready，运行 id 和端口不变", async () => {
    const ctx = await setup("server", { mode: "restart", paths: ["**/*.js"], debounceMs: 300 });
    const run = await ctx.w.startRun(ctx.app, ctx.id, tabOwner());
    await ctx.w.ready(ctx.app, run.runId);
    const port = (await ctx.app.result<RunSnapshot>("run.get", { runId: run.runId })).port;
    expect(port).toBeDefined();
    const before = ctx.app.events.length;
    save(ctx, "server.js", "// 新的返回内容");
    await ctx.w.until(async () => statesSince(ctx, before).includes("reloading"));
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.app, run.runId)) === "ready");
    expect(statesSince(ctx, before)).toEqual(["reloading", "ready"]);
    const after = await ctx.app.result<RunSnapshot>("run.get", { runId: run.runId });
    expect(after.port).toBe(port);
    expect(await runsOf(ctx)).toHaveLength(1);
    await ctx.w.dispose();
  });

  it("[TEMPLATES-RUNNERS-38] 连续保存只重启一次", async () => {
    const ctx = await setup("server", { mode: "restart", paths: ["**/*.js"], debounceMs: 300 });
    const run = await ctx.w.startRun(ctx.app, ctx.id, tabOwner());
    await ctx.w.ready(ctx.app, run.runId);
    const before = ctx.app.events.length;
    for (let i = 0; i < 3; i++) save(ctx, "server.js", `// v${i}`);
    await settle(ctx);
    expect(statesSince(ctx, before).filter((state) => state === "reloading")).toHaveLength(1);
    await ctx.w.dispose();
  });
});
