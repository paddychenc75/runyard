import type { LogEntry, RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { cliOwner, RunWorld } from "./run-harness.test.ts";

// logs.read|follow|clear 经真实的分发、运行引擎（假进程）和日志服务（规格 run/logs）。

interface Read {
  entries: LogEntry[];
  cursor: string;
  truncated: boolean;
  state?: string;
}

async function setup() {
  const w = new RunWorld();
  w.withLogs = true;
  await w.start();
  const cli = await w.client(false);
  const app = await w.app();
  const id = await w.newProject(cli, "demo");
  return { w, cli, app, id };
}

const texts = (entries: readonly LogEntry[]) =>
  entries.flatMap((entry) => (entry.kind === "system" ? [] : [entry.text]));

describe("logs.read", () => {
  it("按名称或 id 读到运行的输出，带最近一次运行的状态；项目不存在是 PLAYGROUND_NOT_FOUND", async () => {
    const { w, cli, id } = await setup();
    w.world.fake.processes.when((spec) => spec.argv[1] === "server.js", {
      listenOn: { port: w.portOf(id), atMs: 100 },
      output: [
        { atMs: 10, stream: "stdout", data: "hello\n" },
        { atMs: 20, stream: "stderr", data: "\u001b[31mwarn\u001b[0m\n" },
      ],
    });
    const run = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, run.runId);
    const byName = await cli.result<Read>("logs.read", { playground: "demo" });
    expect(texts(byName.entries)).toEqual(["hello", "warn"]);
    expect(byName.state).toBe("ready");
    const raw = await cli.result<Read>("logs.read", { playground: id, raw: true });
    expect(texts(raw.entries)).toEqual(["hello", "\u001b[31mwarn\u001b[0m"]);
    expect(await cli.errorCode("logs.read", { playground: "nope" })).toBe("PLAYGROUND_NOT_FOUND");
    await w.dispose();
  });

  it("[RUN-LOGS-11] 强制停止时已经打印的 5 行都在日志里", async () => {
    const { w, cli, id } = await setup();
    w.world.fake.processes.when((spec) => spec.argv[1] === "server.js", {
      ignoresStop: true,
      output: [1, 2, 3, 4, 5].map((n) => ({
        atMs: n * 1000,
        stream: "stdout" as const,
        data: `line ${n}\n`,
      })),
    });
    const run = await w.startRun(cli, id, cliOwner);
    await w.until(
      async () => (await cli.result<Read>("logs.read", { playground: id })).entries.length >= 5,
    );
    await w.drive(cli.result("run.stop", { runId: run.runId }));
    expect(await w.stateOf(cli, run.runId)).toBe("stopped");
    const result = await cli.result<Read>("logs.read", { playground: id });
    expect(texts(result.entries).filter((line) => line.startsWith("line "))).toEqual([
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
    ]);
    await w.dispose();
  });

  it("[RUN-LOGS-20] 运行已 stopped 后仍能读到日志；游标接着读只有新运行的内容", async () => {
    const { w, cli, id } = await setup();
    w.world.fake.processes.when((spec) => spec.argv[1] === "server.js", {
      listenOn: { port: w.portOf(id), atMs: 100 },
      output: [{ atMs: 10, stream: "stdout", data: "first run\n" }],
    });
    const first = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, first.runId);
    await w.drive(cli.result("run.stop", { runId: first.runId }));
    const afterStop = await cli.result<Read>("logs.read", { playground: id });
    expect(texts(afterStop.entries)).toContain("first run");
    expect(afterStop.state).toBe("stopped");

    const second = await w.startRun(cli, id, cliOwner);
    await w.ready(cli, second.runId);
    const next = await cli.result<Read>("logs.read", { playground: id, since: afterStop.cursor });
    // 游标属于上一次运行：给第二次运行的全部，并标 truncated
    expect(next.truncated).toBe(true);
    expect(next.cursor.startsWith(second.runId)).toBe(true);
    await w.dispose();
  });
});

describe("logs.follow", () => {
  it("订阅之后的新条目以 run.log 事件推送；取消订阅之后不再推", async () => {
    const { w, cli, id } = await setup();
    const other = await w.newProject(cli, "other");
    w.world.fake.processes.when((spec) => spec.argv[1] === "server.js", {
      listenOn: { port: 0, atMs: 100000 },
      output: [
        { atMs: 1000, stream: "stdout", data: "\u001b[32mgreen\u001b[0m\n" },
        { atMs: 2000, stream: "stdout", data: "second\n" },
      ],
    });
    const run = await w.startRun(cli, id, cliOwner);
    const { sub } = await cli.result<{ sub: number }>("logs.follow", { playground: "demo" });
    const raw = await w.app();
    await raw.result("logs.follow", { playground: id, raw: true });
    // 别的项目的日志不会推给 demo 的订阅
    await w.startRun(cli, other, cliOwner);
    await w.clock.advance(1500);
    await cli.waitForEvent("run.log");
    expect(cli.eventsOf("run.log")).toEqual([
      expect.objectContaining({ kind: "stdout", text: "green" }),
    ]);
    await raw.waitForEvent("run.log");
    expect(raw.eventsOf("run.log")).toEqual([
      expect.objectContaining({ text: "\u001b[32mgreen\u001b[0m" }),
    ]);
    await cli.result("events.unsubscribe", { sub });
    await w.clock.advance(1000);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(cli.eventsOf("run.log")).toHaveLength(1);
    expect(run.runId).toBeDefined();
    await w.dispose();
  });
});

describe("logs.clear", () => {
  it("清除之后读到空，之后的新输出照常记", async () => {
    const { w, cli, id } = await setup();
    w.world.fake.processes.when((spec) => spec.argv[1] === "server.js", {
      output: [
        { atMs: 10, stream: "stdout", data: "before\n" },
        { atMs: 5000, stream: "stdout", data: "after\n" },
      ],
    });
    const run = await w.startRun(cli, id, cliOwner);
    await w.until(async () =>
      texts((await cli.result<Read>("logs.read", { playground: id })).entries).includes("before"),
    );
    await cli.result("logs.clear", { playground: id });
    expect(texts((await cli.result<Read>("logs.read", { playground: id })).entries)).toEqual([]);
    await w.until(async () =>
      texts((await cli.result<Read>("logs.read", { playground: id })).entries).includes("after"),
    );
    expect(texts((await cli.result<Read>("logs.read", { playground: id })).entries)).toEqual([
      "after",
    ]);
    expect(await cli.errorCode("logs.clear", { playground: "nope" })).toBe("PLAYGROUND_NOT_FOUND");
    await w.drive(cli.result<RunSnapshot>("run.stop", { runId: run.runId }));
    await w.dispose();
  });
});
