import type { RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { cliOwner, RunWorld, tabOwner } from "./run-harness.test.ts";

// run.* 方法（规格 run/lifecycle、run/scripts 里管理进程负责的部分）。

async function setup(options: { script?: boolean } = {}) {
  const w = new RunWorld();
  await w.start();
  const cli = await w.client(false);
  const app = await w.app();
  w.server(undefined);
  const id = await w.newProject(cli, "demo", options.script);
  return { w, cli, app, id };
}

const errorOf = async (
  pump: { call: (m: string, p?: unknown) => Promise<Record<string, unknown>> },
  method: string,
  params: unknown,
) => (await pump.call(method, params)).error as { code: string; params: Record<string, unknown> };

describe("run.start", () => {
  it("项目不存在：PLAYGROUND_NOT_FOUND；文件夹找不到：FOLDER_MISSING", async () => {
    const { w, cli, id } = await setup();
    expect(
      (await errorOf(cli, "run.start", { playground: "nope", owner: cliOwner, wait: "none" })).code,
    ).toBe("PLAYGROUND_NOT_FOUND");
    await w.world.fake.platform.fs.moveDir(w.at("demo"), w.at("moved"));
    expect(
      (await errorOf(cli, "run.start", { playground: id, owner: cliOwner, wait: "none" })).code,
    ).toBe("FOLDER_MISSING");
    await w.dispose();
  });

  it("wait 为 ready：就绪后才返回，快照带地址和端口，新运行 alreadyRunning 为 false", async () => {
    const { w, cli, id } = await setup();
    const result = await w.drive(
      cli.result<RunSnapshot>("run.start", { playground: id, owner: cliOwner, wait: "ready" }),
    );
    expect(result).toMatchObject({ state: "ready", alreadyRunning: false, kind: "server" });
    expect(result.url).toBe(`http://127.0.0.1:${w.portOf(id)}`);
    await w.dispose();
  });

  it("[RUN-LIFECYCLE-11] 等待就绪超时：READY_TIMEOUT，进程继续运行，没有被杀", async () => {
    const { w, cli, id } = await setup();
    w.world.fake.processes.when((spec) => spec.argv[1] === "server.js", {});
    const response = await w.drive(
      cli.call("run.start", { playground: id, owner: cliOwner, wait: "ready", timeoutMs: 3000 }),
    );
    expect((response.error as { code: string }).code).toBe("READY_TIMEOUT");
    expect(w.world.fake.processes.alive()).toHaveLength(1);
    const [run] = await cli.result<RunSnapshot[]>("run.list", { running: true });
    expect(run?.state).toBe("starting");
    await w.dispose();
  });

  it("就绪前进程退出：把运行的失败原因原样作为错误返回", async () => {
    const { w, cli, id } = await setup();
    w.world.fake.processes.when((spec) => spec.argv[1] === "server.js", {
      output: [{ atMs: 10, stream: "stderr", data: "boom\n" }],
      exit: { afterMs: 50, code: 1 },
    });
    const response = await w.drive(
      cli.call("run.start", { playground: id, owner: cliOwner, wait: "ready" }),
    );
    expect(response.error).toMatchObject({ code: "RUN_FAILED", params: { name: "demo" } });
    await w.dispose();
  });

  it("run.start 记一次使用：lastUsedAt 更新", async () => {
    const { w, cli, id } = await setup();
    const before = (await cli.result<{ lastUsedAt: number }>("playground.get", { playground: id }))
      .lastUsedAt;
    await w.clock.advance(60_000);
    await w.startRun(cli, id, cliOwner);
    const after = (await cli.result<{ lastUsedAt: number }>("playground.get", { playground: id }))
      .lastUsedAt;
    expect(after).toBeGreaterThan(before);
    await w.dispose();
  });

  it("run.state 与 run.exit 事件；runningCount 随运行增减，并通知空闲计时", async () => {
    const { w, app, cli, id } = await setup();
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);
    const states = (await (async () => {
      await app.waitForEvent("run.state");
      return app.eventsOf("run.state");
    })()) as { run: RunSnapshot; runningCount: number }[];
    expect(states.some((event) => event.run.state === "ready" && event.runningCount === 1)).toBe(
      true,
    );
    expect(w.module.runCount()).toBe(1);

    await w.drive(cli.result("run.stop", { runId: run.runId }));
    await app.waitForEvent("run.exit");
    expect(app.eventsOf("run.exit")).toEqual([{ runId: run.runId, exitCode: 0 }]);
    expect(w.module.runCount()).toBe(0);
    await w.dispose();
  });

  it("[RUN-LIFECYCLE-13] 两个客户端同时启动同一个项目：只起一个进程，拿到同一个运行", async () => {
    const { w, cli, app, id } = await setup();
    const [a, b] = await Promise.all([
      w.startRun(cli, id, cliOwner),
      w.startRun(app, id, tabOwner()),
    ]);
    expect(a.runId).toBe(b.runId);
    await w.ready(cli, a.runId);
    expect(w.world.fake.processes.spawned).toHaveLength(1);
    await w.dispose();
  });
});

describe("停止中再启动", () => {
  it("[CLI-COMMANDS-78] 等停止完成后起新的运行：新 runId，alreadyRunning 为 false，任何时刻只有一个进程", async () => {
    const { w, cli, id } = await setup();
    w.server(undefined, { stopDelayMs: 1500 });
    const first = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, first.runId);

    const stopping = cli.call("run.stop", { runId: first.runId });
    await w.until(async () => (await w.stateOf(cli, first.runId)) === "stopping");
    const second = await w.drive(
      cli.result<RunSnapshot>("run.start", { playground: id, owner: cliOwner, wait: "ready" }),
    );
    await w.drive(stopping);
    expect(second.runId).not.toBe(first.runId);
    expect(second.alreadyRunning).toBe(false);
    expect(await w.stateOf(cli, first.runId)).toBe("stopped");
    expect(w.world.fake.processes.alive()).toHaveLength(1);
    await w.dispose();
  });

  it("[CLI-COMMANDS-79] 停止超过时限仍未完成：BUSY，没有起新的进程", async () => {
    const { w, cli, id } = await setup();
    const first = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, first.runId);
    // 假平台让停止一直不完成：终止请求挂住，直到测试结束才放行
    const proc = w.world.fake.platform.proc as {
      terminate: (...args: never[]) => Promise<unknown>;
    };
    const realTerminate = proc.terminate.bind(proc);
    let release: () => void = () => {};
    const hang = new Promise<void>((resolve) => {
      release = resolve;
    });
    proc.terminate = async (...args) => {
      await hang;
      return realTerminate(...args);
    };
    void cli.call("run.stop", { runId: first.runId });
    await w.until(async () => (await w.stateOf(cli, first.runId)) === "stopping");

    const startedAt = w.clock.now();
    const response = await w.drive(
      cli.call("run.start", { playground: id, owner: cliOwner, wait: "ready" }),
      500,
    );
    expect(response.error).toMatchObject({ code: "BUSY", params: { name: "demo" } });
    expect(w.clock.now() - startedAt).toBeGreaterThanOrEqual(10_000);
    expect(w.world.fake.processes.spawned).toHaveLength(1);
    release();
    await w.dispose();
  });
});

describe("停止、重启、列表", () => {
  it("run.stop 按项目找；找不到运行记录是 RUN_NOT_FOUND", async () => {
    const { w, cli, id } = await setup();
    expect((await errorOf(cli, "run.stop", { playground: id })).code).toBe("RUN_NOT_FOUND");
    expect((await errorOf(cli, "run.get", { runId: "run-x" })).code).toBe("RUN_NOT_FOUND");
    expect((await errorOf(cli, "run.stop", { playground: "nope" })).code).toBe(
      "PLAYGROUND_NOT_FOUND",
    );
    await w.dispose();
  });

  it("[RUN-LIFECYCLE-23] stopAll 带 mine 时只停命令行持有的", async () => {
    const { w, cli, app, id } = await setup();
    const other = await w.newProject(cli, "other");
    const mine = await w.startRun(cli, id, cliOwner);
    const tab = await w.startRun(app, other, tabOwner());
    await w.ready(cli, mine.runId);
    await w.ready(cli, tab.runId);

    const result = await w.drive(cli.result<{ stopped: string[] }>("run.stopAll", { mine: true }));
    expect(result.stopped).toEqual([mine.runId]);
    expect(await w.stateOf(cli, tab.runId)).toBe("ready");
    const all = await w.drive(cli.result<{ stopped: string[] }>("run.stopAll", {}));
    expect(all.stopped).toEqual([tab.runId]);
    await w.dispose();
  });

  it("[RUN-LIFECYCLE-22] restart 保持端口和持有者，换新的运行 id", async () => {
    const { w, cli, id } = await setup();
    const first = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, first.runId);
    const restarted = await w.drive(cli.result<RunSnapshot>("run.restart", { playground: id }));
    expect(restarted.runId).not.toBe(first.runId);
    expect(restarted.owner).toEqual(cliOwner);
    await w.ready(cli, restarted.runId);
    const now = await cli.result<RunSnapshot>("run.get", { runId: restarted.runId });
    expect(now.port).toBe(w.portOf(id));
    await w.dispose();
  });

  it("run.list 的 running 只要仍计入“运行中”的", async () => {
    const { w, cli, id } = await setup();
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);
    await w.drive(cli.result("run.stop", { runId: run.runId }));
    expect(await cli.result<RunSnapshot[]>("run.list", { running: true })).toEqual([]);
    expect(await cli.result<RunSnapshot[]>("run.list", {})).toHaveLength(1);
    await w.dispose();
  });
});

describe("脚本的标准输入", () => {
  async function runningScript() {
    const ctx = await setup({ script: true });
    const run = await ctx.w.startRun(ctx.cli, ctx.id, cliOwner);
    await ctx.w.until(async () => (await ctx.w.stateOf(ctx.cli, run.runId)) === "running");
    return { ...ctx, run };
  }
  const stdinOf = (w: RunWorld, index = 0) => w.world.fake.processes.spawned[index]?.stdinText();

  it("[RUN-SCRIPTS-22] run.stdin 把一行输入交给脚本", async () => {
    const { w, cli, run } = await runningScript();
    await cli.result("run.stdin", { runId: run.runId, data: "abc\n" });
    expect(stdinOf(w)).toBe("abc\n");
    await w.dispose();
  });

  it("[RUN-SCRIPTS-23] 不补换行：原样写入，换行由调用方给", async () => {
    const { w, cli, run } = await runningScript();
    await cli.result("run.stdin", { runId: run.runId, data: "abc" });
    expect(stdinOf(w)).toBe("abc");
    await cli.result("run.stdin", { runId: run.runId, data: "\n" });
    expect(stdinOf(w)).toBe("abc\n");
    await w.dispose();
  });

  it("[RUN-SCRIPTS-24] 服务不接收输入：NOT_SUPPORTED", async () => {
    const { w, cli, id } = await setup();
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);
    expect((await errorOf(cli, "run.stdin", { runId: run.runId, data: "x" })).code).toBe(
      "NOT_SUPPORTED",
    );
    expect(w.world.fake.processes.spawned[0]?.stdinText()).toBe("");
    await w.dispose();
  });

  it("[RUN-SCRIPTS-25] 已结束的运行：RUN_NOT_FOUND，什么也没写入", async () => {
    const { w, cli, run } = await runningScript();
    w.world.fake.processes.exit(w.world.fake.processes.alive()[0] ?? { pid: 0, startTime: 0 }, 0);
    await w.until(async () => (await w.stateOf(cli, run.runId)) === "finished");
    expect((await errorOf(cli, "run.stdin", { runId: run.runId, data: "late" })).code).toBe(
      "RUN_NOT_FOUND",
    );
    expect(stdinOf(w)).toBe("");
    await w.dispose();
  });

  it("[RUN-SCRIPTS-26] 重新运行不带上旧输入", async () => {
    const { w, cli, id, run } = await runningScript();
    await cli.result("run.stdin", { runId: run.runId, data: "abc\n" });
    w.world.fake.processes.exit(w.world.fake.processes.alive()[0] ?? { pid: 0, startTime: 0 }, 0);
    await w.until(async () => (await w.stateOf(cli, run.runId)) === "finished");

    const again = await w.startRun(cli, id, cliOwner);
    await w.until(async () => (await w.stateOf(cli, again.runId)) === "running");
    expect(again.runId).not.toBe(run.runId);
    expect(stdinOf(w, 1)).toBe("");
    await w.dispose();
  });
});

describe("资源库用的 RunsView", () => {
  it("activePlaygrounds、isBusy、ownerOf 反映当前运行", async () => {
    const { w, cli, id } = await setup();
    const { runs } = w.module;
    expect(runs.ownerOf(id)).toBeUndefined();
    const run = await w.startRun(cli, id, cliOwner);
    expect(runs.activePlaygrounds().has(id)).toBe(true);
    expect(runs.isBusy(id)).toBe(true);
    await w.ready(cli, run.runId);
    expect(runs.isBusy(id)).toBe(false);
    expect(runs.ownerOf(id)).toEqual(cliOwner);
    await w.dispose();
  });

  it("改名正在运行的项目：先停止、改名，再用同一个持有者启动", async () => {
    const { w, app, id } = await setup();
    const run = await w.startRun(app, id, tabOwner());
    await w.ready(app, run.runId);
    await w.drive(app.result("playground.rename", { playground: id, newName: "renamed" }));
    await w.until(async () => {
      const running = await app.result<RunSnapshot[]>("run.list", { running: true });
      return running.some((r) => r.name === "renamed" && r.state === "ready");
    });
    const running = await app.result<RunSnapshot[]>("run.list", { running: true });
    expect(running[0]?.owner).toEqual(tabOwner());
    expect(await w.stateOf(app, run.runId)).toBe("stopped");
    await w.dispose();
  });
});

describe("关闭管理进程", () => {
  it("退出前停掉所有运行，进程树一个不剩", async () => {
    const { w, cli, app, id } = await setup();
    const other = await w.newProject(cli, "other");
    const a = await w.startRun(cli, id, cliOwner);
    const b = await w.startRun(app, other, tabOwner());
    await w.ready(cli, a.runId);
    await w.ready(cli, b.runId);
    await w.drive(w.handle.api.shutdown("user"));
    expect(w.world.fake.processes.alive()).toEqual([]);
    await w.dispose();
  });
});
