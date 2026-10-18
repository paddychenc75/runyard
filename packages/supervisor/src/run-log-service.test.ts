import { join } from "node:path";
import { absPath } from "@runyard/platform";
import type { LogEntry } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { RUN_LOG_MAX_BYTES } from "./run-log-files.ts";
import { RunLogRing } from "./run-log-ring.ts";
import { RunLogService } from "./run-log-service.ts";

// 日志服务的单元测试：假平台的内存文件系统，不起管理进程。

const PG = "pg-1";
const out = (text: string, at = 1): LogEntry => ({ at, kind: "stdout", text });

function setup() {
  const fake = createFakePlatform();
  const { platform } = fake;
  const dir = absPath(join(platform.paths.stateDir, "logs"));
  const playgrounds = new Map<string, string>();
  const make = () =>
    new RunLogService({
      platform,
      dir,
      playgroundOf: (runId) => playgrounds.get(runId),
      stateOf: () => undefined,
    });
  const logs = make();
  /** 登记运行属于哪个项目，再写若干行 */
  const run = (runId: string, lines: readonly (string | LogEntry)[], playground = PG) => {
    playgrounds.set(runId, playground);
    for (const line of lines) logs.record(runId, typeof line === "string" ? out(line) : line);
  };
  const files = () => platform.fs.listFiles(dir);
  return { fake, platform, dir, logs, make, run, files, playgrounds };
}

const texts = (entries: readonly LogEntry[]) =>
  entries.map((entry) => (entry.kind === "system" ? entry.notice.code : entry.text));

describe("内存环形缓冲", () => {
  it("[RUN-LOGS-13] 一次运行输出 1 万零 500 行，内存里只留最近 1 万行", async () => {
    const { logs, run } = setup();
    run(
      "run-a-1",
      Array.from({ length: 10_500 }, (_, i) => `line ${i + 1}`),
    );
    const result = await logs.read(PG, { raw: true });
    expect(result.entries).toHaveLength(10_000);
    expect(texts(result.entries)[0]).toBe("line 501");
    expect(texts(result.entries).at(-1)).toBe("line 10500");
  });

  it("[RUN-LOGS-13] 超过 4 MB 也掐旧行（先到为准），最新的一行再大也留着", () => {
    const ring = new RunLogRing({ maxLines: 10_000, maxBytes: 1000 });
    for (let seq = 1; seq <= 5; seq++) ring.push({ seq, entry: out("x"), bytes: 300 });
    expect(ring.lines().map((line) => line.seq)).toEqual([3, 4, 5]);
    ring.push({ seq: 6, entry: out("big"), bytes: 5000 });
    expect(ring.lines().map((line) => line.seq)).toEqual([6]);
    expect(ring.firstSeq).toBe(6);
  });
});

describe("磁盘文件", () => {
  it("一行一个 JSON，带序号；颜色码原样存（[RUN-LOGS-04]），读取时才清洗", async () => {
    const { logs, run, platform, dir, files } = setup();
    run("run-a-1", ["\u001b[31merror\u001b[0m"]);
    await logs.flush();
    expect(await files()).toEqual(["run-a-1.pg-1.jsonl"]);
    const text = await platform.fs.readText(absPath(join(dir, "run-a-1.pg-1.jsonl")));
    expect(JSON.parse(text ?? "")).toEqual({
      at: 1,
      kind: "stdout",
      text: "\u001b[31merror\u001b[0m",
      seq: 1,
    });
    expect(texts((await logs.read(PG, { raw: true })).entries)).toEqual([
      "\u001b[31merror\u001b[0m",
    ]);
    expect(texts((await logs.read(PG)).entries)).toEqual(["error"]);
  });

  it("[RUN-LOGS-14] 一次运行的日志超过 10 MB：磁盘上只留最后一部分，文件不超过 10 MB", async () => {
    const { logs, run, platform, dir } = setup();
    // 总量仍是 12 MB（真实的 10 MB 上限，不注入小阈值）；用 120 行大行而不是 1.2 万行小行，
    // 把逐行序列化、逐行断言的开销降两个数量级，CI 慢机器上不再逼近 5 秒上限（#140）
    const line = "x".repeat(100_000);
    const total = 120;
    run(
      "run-a-1",
      Array.from({ length: total }, (_, i) => `${i + 1} ${line}`),
    );
    await logs.flush();
    const file = absPath(join(dir, "run-a-1.pg-1.jsonl"));
    const text = (await platform.fs.readText(file)) ?? "";
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(RUN_LOG_MAX_BYTES);
    const rows = text.trimEnd().split("\n");
    const first = JSON.parse(rows[0] as string) as { seq: number };
    const last = JSON.parse(rows.at(-1) as string) as { seq: number; text: string };
    // 掐的是头部：最后一行还在，最前面的没了；掐掉旧行后序号不重排，从中间开始
    expect(last.seq).toBe(total);
    expect(last.text.startsWith(`${total} `)).toBe(true);
    expect(first.seq).toBeGreaterThan(1);
    // 每一行都是完整的 JSON（没有从行中间切开）；这里不对每行单独 expect，只数坏行
    let broken = 0;
    for (const row of rows) {
      try {
        JSON.parse(row);
      } catch {
        broken += 1;
      }
    }
    expect(broken).toBe(0);
  });

  it("[RUN-LOGS-15] 第 6 次运行开始时，最旧一次的日志被删除，只剩最近 5 次；别的项目不受影响", async () => {
    const { logs, run, files } = setup();
    run("run-a-1", ["other"], "pg-2");
    for (const id of ["run-a-2", "run-a-3", "run-a-4", "run-a-5", "run-a-6"]) run(id, [id]);
    await logs.flush();
    expect(await files()).toHaveLength(6); // pg-1 五次 + pg-2 一次
    run("run-a-7", ["run-a-7"]);
    await logs.flush();
    expect(await files()).toEqual([
      "run-a-1.pg-2.jsonl",
      "run-a-3.pg-1.jsonl",
      "run-a-4.pg-1.jsonl",
      "run-a-5.pg-1.jsonl",
      "run-a-6.pg-1.jsonl",
      "run-a-7.pg-1.jsonl",
    ]);
  });

  it("运行 id 的序号位数不同（9 之后是 a、z 之后是 10）时，按数值而不是字符串找最旧的", async () => {
    const { logs, run, files } = setup();
    for (const id of ["run-a-9", "run-a-a", "run-a-z", "run-a-10", "run-a-11"]) run(id, [id]);
    run("run-a-12", ["new"]);
    await logs.flush();
    expect(await files()).not.toContain("run-a-9.pg-1.jsonl");
    expect(await files()).toContain("run-a-a.pg-1.jsonl");
  });

  it("[RUN-LOGS-20] 运行结束、管理进程重启之后仍能读到最近一次的日志，序号接着往后", async () => {
    const { logs, run, make } = setup();
    run("run-a-1", ["old", "older"]);
    run("run-a-2", ["one", "two"]);
    await logs.flush();
    const restarted = make();
    const result = await restarted.read(PG);
    expect(texts(result.entries)).toEqual(["one", "two"]);
    expect(result.cursor).toBe("run-a-2:2");
    expect(result.state).toBeUndefined();
  });

  it("[RUN-LOGS-20] 新的一次运行没产生任何输出就失败：读到的是这次的空日志，不是上一次的输出", async () => {
    const { logs, run, make, playgrounds } = setup();
    run("run-a-1", ["Hello, Runyard!"]);
    const old = (await logs.read(PG)).cursor;
    playgrounds.set("run-a-2", PG);
    logs.beginRun("run-a-2");
    const result = await logs.read(PG);
    expect(result.entries).toEqual([]);
    expect(result.cursor).toBe("run-a-2:0");
    // 带着上一次运行的游标来读：当作掐掉了，给的是这次运行的全部（空）
    const again = await logs.read(PG, { since: old });
    expect(again).toMatchObject({ entries: [], truncated: true });
    // 管理进程重启后从磁盘读回来，最近一次仍是那次没有输出的运行
    await logs.flush();
    expect((await make().read(PG)).entries).toEqual([]);
  });

  it("崩溃留下的半行和坏行读到时跳过", async () => {
    const { platform, dir, make } = setup();
    await platform.fs.makeDir(dir);
    const good = JSON.stringify({ at: 1, kind: "stdout", text: "ok", seq: 1 });
    await platform.fs.writeFile(
      absPath(join(dir, "run-a-1.pg-1.jsonl")),
      `${good}\nnot json\n{"at":1,"kind":"stdout","te`,
    );
    expect(texts((await make().read(PG)).entries)).toEqual(["ok"]);
  });
});

describe("读取与游标", () => {
  it("[RUN-LOGS-16] 带上次的游标读取，只返回其后的内容和新的游标", async () => {
    const { logs, run } = setup();
    run("run-a-1", ["a", "b"]);
    const first = await logs.read(PG);
    expect(first.cursor).toBe("run-a-1:2");
    run("run-a-1", ["c"]);
    const next = await logs.read(PG, { since: first.cursor });
    expect(texts(next.entries)).toEqual(["c"]);
    expect(next.cursor).toBe("run-a-1:3");
    expect(next.truncated).toBe(false);
    // 没有新内容：空，游标不变
    const none = await logs.read(PG, { since: next.cursor });
    expect(none.entries).toEqual([]);
    expect(none.cursor).toBe(next.cursor);
  });

  it("[RUN-LOGS-17] 游标来自更早的运行：返回当前运行的全部，truncated 为 true", async () => {
    const { logs, run } = setup();
    run("run-a-1", ["a", "b"]);
    const old = (await logs.read(PG)).cursor;
    run("run-a-2", ["x", "y", "z"]);
    const result = await logs.read(PG, { since: old });
    expect(texts(result.entries)).toEqual(["x", "y", "z"]);
    expect(result.truncated).toBe(true);
    expect(result.cursor).toBe("run-a-2:3");
  });

  it("游标不透明：认不得的运行 id 一律当作更早的运行；超前的序号是空结果而不是错误", async () => {
    const { logs, run } = setup();
    run("run-a-1", ["a", "b"]);
    const unknown = await logs.read(PG, { since: "made-up:7" });
    expect(texts(unknown.entries)).toEqual(["a", "b"]);
    expect(unknown.truncated).toBe(true);
    const ahead = await logs.read(PG, { since: "run-a-1:99" });
    expect(ahead.entries).toEqual([]);
    expect(ahead.truncated).toBe(false);
    expect(ahead.cursor).toBe("run-a-1:2");
  });

  it("游标之后的行已经被环形缓冲掐掉：能读到的照给，truncated 为 true", async () => {
    const { logs, run } = setup();
    run(
      "run-a-1",
      Array.from({ length: 10_050 }, (_, i) => `l${i + 1}`),
    );
    const result = await logs.read(PG, { since: "run-a-1:10", raw: true });
    expect(result.truncated).toBe(true);
    expect(result.entries).toHaveLength(10_000);
  });

  it("项目从没运行过：空结果，游标不属于任何运行，之后第一次带它读取不算 truncated", async () => {
    const { logs, run } = setup();
    const empty = await logs.read(PG);
    expect(empty).toEqual({ entries: [], cursor: "none:0", truncated: false });
    run("run-a-1", ["a"]);
    const result = await logs.read(PG, { since: empty.cursor });
    expect(texts(result.entries)).toEqual(["a"]);
    expect(result.truncated).toBe(false);
  });

  it("tail 在清洗之后取最后几行；raw 原样返回", async () => {
    const { logs, run } = setup();
    run("run-a-1", ["one", "\u001b[2J", "two", "three"]);
    expect(texts((await logs.read(PG, { tail: 2 })).entries)).toEqual(["two", "three"]);
    expect(texts((await logs.read(PG, { raw: true })).entries)).toHaveLength(4);
  });

  it("系统提示是带代码的结构化条目，原样返回，不被清洗掉", async () => {
    const { logs, run } = setup();
    run("run-a-1", [
      {
        at: 1,
        kind: "system",
        notice: {
          code: "PORT_FALLBACK",
          params: { wanted: 7100, actual: 7101, reason: "PORT_OCCUPIED" },
        },
      },
    ]);
    expect((await logs.read(PG)).entries).toEqual([
      {
        at: 1,
        kind: "system",
        notice: {
          code: "PORT_FALLBACK",
          params: { wanted: 7100, actual: 7101, reason: "PORT_OCCUPIED" },
        },
      },
    ]);
  });

  it("两路输出紧凑写入：都在日志里，序号是到达顺序；不断言 stdout 与 stderr 的严格先后", async () => {
    const { logs, run } = setup();
    run("run-a-1", [
      { at: 1, kind: "stdout", text: "out-1" },
      { at: 1, kind: "stderr", text: "err-1" },
      { at: 1, kind: "stdout", text: "out-2" },
      { at: 1, kind: "stderr", text: "err-2" },
    ]);
    const got = texts((await logs.read(PG)).entries);
    expect([...got].sort()).toEqual(["err-1", "err-2", "out-1", "out-2"]);
    // 同一路内部的先后是保证的
    expect(got.indexOf("out-1")).toBeLessThan(got.indexOf("out-2"));
    expect(got.indexOf("err-1")).toBeLessThan(got.indexOf("err-2"));
  });
});

describe("清除", () => {
  it("清空正在写的这一次（内存和文件），更早的日志文件删掉，序号继续往后", async () => {
    const { logs, run, files, platform, dir } = setup();
    run("run-a-1", ["old"]);
    run("run-a-2", ["a", "b"]);
    run("run-a-9", ["other"], "pg-2");
    await logs.flush();
    await logs.clear(PG);
    await logs.flush();
    expect((await logs.read(PG)).entries).toEqual([]);
    expect(await files()).toEqual(["run-a-2.pg-1.jsonl", "run-a-9.pg-2.jsonl"]);
    expect(await platform.fs.readText(absPath(join(dir, "run-a-2.pg-1.jsonl")))).toBe("");
    run("run-a-2", ["c"]);
    const after = await logs.read(PG);
    expect(texts(after.entries)).toEqual(["c"]);
    expect(after.cursor).toBe("run-a-2:3");
  });

  it("运行已经结束、日志只在磁盘上（管理进程重启过）：清除删掉文件", async () => {
    const { logs, run, make, files } = setup();
    run("run-a-1", ["a"]);
    await logs.flush();
    const restarted = make();
    await restarted.clear(PG);
    expect(await files()).toEqual([]);
    expect((await restarted.read(PG)).entries).toEqual([]);
  });
});

it("写盘失败不影响内存里的读取，也不抛给调用方", async () => {
  const { logs, run, platform } = setup();
  const failing = {
    ...platform.fs,
    appendFile: async () => Promise.reject(new Error("disk full")),
  };
  Object.assign(platform.fs, { appendFile: failing.appendFile });
  expect(() => run("run-a-1", ["a"])).not.toThrow();
  await logs.flush();
  expect(texts((await logs.read(PG)).entries)).toEqual(["a"]);
});
