import type { LogEntry, MethodParams } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import type { ConsoleAppend } from "../shared/console-state.ts";
import { type ConsoleClient, ConsoleLogs, INITIAL_TAIL, MAX_LINES } from "./console-logs.ts";

const out = (text: string, at = 1): LogEntry => ({ at, kind: "stdout", text });

// 假管理进程：日志是一个数组，游标是“已读到第几条”；wake 模拟 logs.follow 推来的“有新东西”事件
class FakeLogs {
  entries: LogEntry[] = [];
  /** 下一次读取要不要当作“游标属于更早一次运行” */
  truncateNext = false;
  reads: MethodParams<"logs.read">[] = [];
  unsubscribed = 0;
  followed = 0;
  wake: (() => void) | undefined;

  client = {
    followLogs: async (_params: unknown, listener: () => void) => {
      this.followed += 1;
      this.wake = listener;
      return {
        sub: 1,
        unsubscribe: async () => {
          this.unsubscribed += 1;
        },
      };
    },
    call: async (_method: "logs.read", params: MethodParams<"logs.read">) => {
      this.reads.push(params);
      const truncated = this.truncateNext;
      this.truncateNext = false;
      const from = truncated || params.since === undefined ? 0 : Number(params.since);
      const entries = this.entries.slice(from);
      return { entries, cursor: String(this.entries.length), truncated };
    },
  } as unknown as ConsoleClient;
}

function setup() {
  const logs = new FakeLogs();
  const console_ = new ConsoleLogs(logs.client);
  const appended: ConsoleAppend[] = [];
  console_.onAppend((append) => appended.push(append));
  return { logs, console: console_, appended };
}

const texts = (lines: { entry: LogEntry }[]) =>
  lines.map((line) => (line.entry.kind === "system" ? "" : line.entry.text));

describe("ConsoleLogs", () => {
  it("[DESKTOP-WORKSPACE-16] 订阅后新输出自动出现：事件一到就按游标读，只推新增的行", async () => {
    const { logs, console: console_, appended } = setup();
    logs.entries = [out("first")];
    await console_.watch("a");
    expect(texts(console_.lines("a"))).toEqual(["first"]);
    expect(appended).toEqual([
      { playground: "a", reset: true, lines: [{ seq: 1, entry: out("first") }] },
    ]);
    // 脚本每秒打印一行：日志多了一条，管理进程推来信号，不需要任何手动刷新
    logs.entries.push(out("second"));
    logs.wake?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appended.at(-1)).toEqual({
      playground: "a",
      reset: false,
      lines: [{ seq: 2, entry: out("second") }],
    });
    expect(logs.reads.at(-1)).toMatchObject({ playground: "a", since: "1" });
  });

  it("第一次读取只要最近一段，后面的读取带游标", async () => {
    const { logs, console: console_ } = setup();
    await console_.watch("a");
    expect(logs.reads[0]).toEqual({ playground: "a", tail: INITIAL_TAIL });
  });

  it("[DESKTOP-WORKSPACE-17] 界面卸载再挂载：主进程留着的行都还在，并继续接新的", async () => {
    const { logs, console: console_ } = setup();
    logs.entries = [out("one"), out("two")];
    await console_.watch("a");
    // 界面切走、回来：重新取一份快照，内容不变，seq 不变
    expect(texts(console_.lines("a"))).toEqual(["one", "two"]);
    expect(console_.lines("a").map((line) => line.seq)).toEqual([1, 2]);
    logs.entries.push(out("three"));
    logs.wake?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(console_.lines("a").map((line) => line.seq)).toEqual([1, 2, 3]);
  });

  it("同一个项目重复 watch 不会重复订阅", async () => {
    const { logs, console: console_ } = setup();
    await console_.watch("a");
    await console_.watch("a");
    expect(logs.followed).toBe(1);
  });

  it("停止后再次运行：游标属于更早一次运行时整体替换，不留上次的行", async () => {
    const { logs, console: console_, appended } = setup();
    logs.entries = [out("old")];
    await console_.watch("a");
    logs.entries = [out("new")];
    logs.truncateNext = true;
    logs.wake?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(texts(console_.lines("a"))).toEqual(["new"]);
    expect(appended.at(-1)).toMatchObject({ reset: true });
    expect(appended.at(-1)?.lines).toHaveLength(1);
  });

  it("[DESKTOP-WORKSPACE-18] 新的运行没有输出就失败（缺工具）：没有新行的信号，sync 重读后上一次的输出被清掉", async () => {
    const { logs, console: console_, appended } = setup();
    logs.entries = [out("Hello, Runyard!")];
    await console_.watch("a");
    expect(texts(console_.lines("a"))).toEqual(["Hello, Runyard!"]);
    // 新运行的日志是空的，游标属于上一次运行
    logs.entries = [];
    logs.truncateNext = true;
    await console_.sync("a");
    expect(console_.lines("a")).toEqual([]);
    expect(appended.at(-1)).toMatchObject({ playground: "a", lines: [], reset: true });
  });

  it("sync 对没在跟的项目什么也不做", async () => {
    const { logs, console: console_ } = setup();
    await console_.sync("nope");
    expect(logs.reads).toEqual([]);
  });

  it("内存里每个项目最多留 MAX_LINES 行，丢最早的", async () => {
    const { logs, console: console_ } = setup();
    logs.entries = Array.from({ length: MAX_LINES + 10 }, (_, index) => out(`l${index}`));
    await console_.watch("a");
    const lines = console_.lines("a");
    expect(lines).toHaveLength(MAX_LINES);
    expect(lines[0]?.seq).toBe(11);
  });

  it("项目被去掉：取消订阅并丢掉行", async () => {
    const { logs, console: console_ } = setup();
    logs.entries = [out("x")];
    await console_.watch("a");
    console_.unwatch("a");
    expect(logs.unsubscribed).toBe(1);
    expect(console_.lines("a")).toEqual([]);
  });

  it("管理进程连不上：watch 不抛，控制台为空，之后还能重试", async () => {
    const failing = {
      followLogs: async () => {
        throw new Error("down");
      },
      call: async () => {
        throw new Error("down");
      },
    } as unknown as ConsoleClient;
    const console_ = new ConsoleLogs(failing);
    await expect(console_.watch("a")).resolves.toBeUndefined();
    expect(console_.lines("a")).toEqual([]);
  });
});
