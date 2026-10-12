import { describe, expect, it } from "vitest";
import { eventTopics } from "./enums.ts";
import { type EventName, eventNames, eventRegistry, isEventName } from "./events.ts";
import { methodNames } from "./methods.ts";
import { samplePlayground, sampleRun } from "./sample-data.ts";

interface Example {
  data: unknown;
  /** 非法的数据；只占名字的事件什么都接受，所以不写 */
  badData?: unknown;
}

const empty = {};

// Record<EventName, …>：新增事件而不写样例，类型检查就过不了
const examples: Record<EventName, Example> = {
  "playground.added": { data: samplePlayground, badData: { id: "x" } },
  "playground.changed": { data: samplePlayground, badData: empty },
  "playground.removed": { data: { playgroundId: "p1" }, badData: samplePlayground.id },
  "playground.missing": {
    data: { ...samplePlayground, missingSince: 1_760_000_300_000 },
    badData: null,
  },
  "playground.releaseRequested": {
    data: { playgroundId: "p1", reason: "rename" },
    badData: { playgroundId: "p1", reason: "forget" },
  },
  "run.state": {
    data: { run: sampleRun, previous: "starting", at: 1_760_000_200_500, runningCount: 2 },
    badData: { run: sampleRun, at: 1_760_000_200_500 },
  },
  "run.log": {
    data: { at: 1_760_000_000_000, kind: "stderr", text: "warn" },
    badData: { at: 1, kind: "info", text: "x" },
  },
  "run.exit": {
    data: { runId: "r_1", exitCode: 0, reason: "idle" },
    badData: { runId: "r_1", exitCode: 0, reason: "PORT_RESERVED" },
  },
  "run.port": {
    data: {
      runId: "r_1",
      wanted: 7104,
      actual: 7110,
      occupant: { pid: 99, name: "python3" },
      reason: "PORT_OCCUPIED",
    },
    badData: { runId: "r_1", wanted: 7104, reason: "PORT_OCCUPIED" },
  },
  "toolchain.changed": { data: empty, badData: "changed" },
  "settings.changed": { data: empty, badData: 1 },
  "request.result": { data: { status: 200 } },
  "agent.activity": { data: "whatever" },
  "supervisor.closing": { data: null },
};

describe("事件登记表", () => {
  it("事件名恰好登记一次，格式是小驼峰点号", () => {
    expect(new Set(eventNames).size).toBe(eventNames.length);
    for (const name of eventNames) expect(name).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
    expect(eventNames).toHaveLength(Object.keys(examples).length);
  });

  it("事件名和方法名不重复：搜一个字符串只会找到一种东西", () => {
    for (const name of eventNames) expect(methodNames).not.toContain(name);
  });

  it("每个事件经 events.subscribe 的主题、logs.follow 或根本没人能订阅，主题是登记过的", () => {
    for (const name of eventNames) {
      const { topic } = eventRegistry[name];
      if (topic !== null && topic !== "logs.follow") expect(eventTopics).toContain(topic);
    }
    expect(eventRegistry["run.log"].topic).toBe("logs.follow");
  });

  it("每个主题至少有一个事件，主题就是事件名第一个点之前的部分", () => {
    for (const topic of eventTopics) {
      const names = eventNames.filter((name) => eventRegistry[name].topic === topic);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(name.startsWith(`${topic}.`)).toBe(true);
    }
  });

  it("只占名字的事件没有人能订阅", () => {
    const reserved = eventNames.filter((name) => eventRegistry[name].status === "reserved");
    expect(reserved.sort()).toEqual(["agent.activity", "request.result", "supervisor.closing"]);
    for (const name of reserved) expect(eventRegistry[name].topic).toBeNull();
  });

  it("isEventName 认得登记过的名字", () => {
    expect(isEventName("run.state")).toBe(true);
    expect(isEventName("run.start")).toBe(false);
    expect(isEventName("constructor")).toBe(false);
  });
});

describe("每个事件的合法与非法数据", () => {
  for (const name of eventNames) {
    const { data } = eventRegistry[name];
    const example = examples[name];

    it(`${name}：合法的数据通过`, () => {
      expect(data.safeParse(example.data).success).toBe(true);
    });

    if (eventRegistry[name].status === "reserved") continue;

    it(`${name}：非法的数据被拒绝`, () => {
      expect(data.safeParse(example.badData).success).toBe(false);
    });
  }
});

describe("事件数据的细节", () => {
  it("[RUN-LIFECYCLE-01] run.state 带新的运行快照、上一个状态和“N 个运行中”", () => {
    const parsed = eventRegistry["run.state"].data.parse({
      run: sampleRun,
      at: 1_760_000_200_000,
      runningCount: 1,
    });
    expect(parsed).toMatchObject({ runningCount: 1 });
  });

  it("[RUN-OWNERSHIP-09] run.exit 的 reason 可以是 idle（空闲停止）", () => {
    const { data } = eventRegistry["run.exit"];
    expect(data.safeParse({ runId: "r_1", reason: "idle" }).success).toBe(true);
    expect(data.safeParse({ runId: "r_1", reason: "RUN_FAILED" }).success).toBe(true);
  });

  it("[RUN-PORTS-06] run.port 带原端口、实际端口和占用者", () => {
    const parsed = eventRegistry["run.port"].data.parse(examples["run.port"].data);
    expect(parsed).toMatchObject({ wanted: 7104, actual: 7110, occupant: { pid: 99 } });
  });

  it("[LIBRARY-PLAYGROUNDS-16] releaseRequested 的原因只有改名和移到废纸篓", () => {
    const { data } = eventRegistry["playground.releaseRequested"];
    expect(data.safeParse({ playgroundId: "p1", reason: "trash" }).success).toBe(true);
    expect(data.safeParse({ playgroundId: "p1", reason: "forget" }).success).toBe(false);
  });

  it("[RUN-LOGS-19] run.log 的数据就是 LogEntry，管理进程插入的提示是带代码的 system 条目", () => {
    const entry = {
      at: 1_760_000_000_000,
      kind: "system",
      notice: {
        code: "PORT_FALLBACK",
        params: { wanted: 7104, actual: 7110, reason: "PORT_OCCUPIED" },
      },
    };
    expect(eventRegistry["run.log"].data.safeParse(entry).success).toBe(true);
  });
});
