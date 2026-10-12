import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isErrorCode } from "./errors.ts";
import { methodGroups } from "./method-definition.ts";
import { isMethodName, type MethodName, methodNames, methodRegistry } from "./methods.ts";
import { samplePlayground, sampleRun, sampleSettings } from "./sample-data.ts";

interface Example {
  /** 合法的入参 */
  params: unknown;
  /** 非法的入参；只占名字的方法什么都接受，所以不写 */
  badParams?: unknown;
  /** 合法的出参 */
  result: unknown;
  /** 非法的出参；只占名字的方法什么都接受，所以不写 */
  badResult?: unknown;
}

const tab = { kind: "tab", clientId: "c1", tabId: "t1" };
const cli = { kind: "cli", command: "run demo" };
const report = { tools: [{ tool: "node", status: "found", version: "24.21.0" }] };
const subscription = { sub: 3 };
const empty = {};

// Record<MethodName, …>：新增方法而不写样例，类型检查就过不了
const examples: Record<MethodName, Example> = {
  ping: { params: empty, badParams: "ping", result: empty, badResult: null },
  "session.bye": { params: empty, badParams: [], result: empty, badResult: "ok" },
  "supervisor.info": {
    params: empty,
    badParams: 1,
    result: { protocol: 1, version: "1.0.0", build: "1.0.0+abc", startedBy: "cli", runs: 2 },
    badResult: { protocol: 1, version: "1.0.0", build: "1.0.0+abc", startedBy: "daemon", runs: 2 },
  },
  "supervisor.shutdown": {
    params: { ifIdle: true, reason: "upgrade" },
    badParams: { ifIdle: true, reason: "crash" },
    result: { closing: false },
    badResult: empty,
  },
  "events.subscribe": {
    params: { topics: ["run", "playground"] },
    badParams: { topics: [] },
    result: subscription,
    badResult: { sub: -1 },
  },
  "events.unsubscribe": {
    params: subscription,
    badParams: { sub: "3" },
    result: empty,
    badResult: 0,
  },
  "playground.list": {
    params: { filter: { running: true, createdBy: "agent" } },
    badParams: { filter: { createdBy: "robot" } },
    result: [samplePlayground],
    badResult: [{ id: "x" }],
  },
  "playground.get": {
    params: { playground: "demo" },
    badParams: { playground: "" },
    result: samplePlayground,
    badResult: { ...samplePlayground, kind: "script" },
  },
  "playground.create": {
    params: {
      template: "react19",
      name: "pricing-table",
      note: "pricing table layout test",
      autoClean: 7,
      vars: { title: "Pricing" },
      ifExists: "reuse",
      createdBy: { kind: "agent", agent: "Claude Code", command: "new react19" },
    },
    badParams: { template: "react19", ifExists: "overwrite", createdBy: { kind: "cli" } },
    result: { playground: samplePlayground, created: true },
    badResult: { playground: samplePlayground },
  },
  "playground.rename": {
    params: { playground: "demo", newName: "demo2" },
    badParams: { playground: "demo" },
    result: samplePlayground,
    badResult: empty,
  },
  "playground.update": {
    params: { playground: "demo", note: "x", autoClean: null, scriptAutoRun: false },
    badParams: { playground: "demo", autoClean: 0 },
    result: samplePlayground,
    badResult: empty,
  },
  "playground.duplicate": {
    params: { playground: "demo", name: "demo-copy" },
    badParams: { name: "demo-copy" },
    result: samplePlayground,
    badResult: empty,
  },
  "playground.trash": {
    params: { playground: "demo" },
    badParams: {},
    result: { trashed: true, deletedRegenerable: ["node_modules"] },
    badResult: { trashed: true },
  },
  "playground.relocate": {
    params: { playground: "demo", path: "/Users/someone/elsewhere/demo" },
    badParams: { playground: "demo", path: "" },
    result: samplePlayground,
    badResult: empty,
  },
  "playground.forget": {
    params: { playground: "demo" },
    badParams: {},
    result: empty,
    badResult: "done",
  },
  "playground.released": {
    params: { playgroundId: samplePlayground.id },
    badParams: { playgroundId: "" },
    result: empty,
    badResult: 1,
  },
  "library.rescan": { params: empty, badParams: null, result: empty, badResult: null },
  "run.start": {
    params: { playground: "demo", owner: cli, wait: "ready", timeoutMs: 30_000, port: 7500 },
    badParams: { playground: "demo", owner: cli, wait: "later" },
    result: sampleRun,
    badResult: { ...sampleRun, state: "paused" },
  },
  "run.stop": {
    params: { runId: "r_1" },
    badParams: {},
    result: { ...sampleRun, state: "stopped" },
    badResult: { ...sampleRun, state: "stop" },
  },
  "run.stopAll": {
    params: { mine: true },
    badParams: { mine: "yes" },
    result: { stopped: ["r_1", "r_2"] },
    badResult: ["r_1"],
  },
  "run.restart": {
    params: { playground: "demo" },
    badParams: { playground: "" },
    result: sampleRun,
    badResult: empty,
  },
  "run.get": { params: { runId: "r_1" }, badParams: {}, result: sampleRun, badResult: empty },
  "run.list": {
    params: { running: true },
    badParams: { running: 1 },
    result: [sampleRun],
    badResult: sampleRun,
  },
  "run.adopt": {
    params: { runId: "r_1", owner: tab },
    badParams: { runId: "r_1", owner: cli },
    result: { ...sampleRun, owner: tab },
    badResult: empty,
  },
  "run.disown": { params: { anything: 1 }, result: "whatever" },
  "run.attach": {
    params: { runId: "r_1", clientId: "c1" },
    badParams: { runId: "r_1" },
    result: empty,
    badResult: 1,
  },
  "run.detach": {
    params: { runId: "r_1", clientId: "c1" },
    badParams: { clientId: "c1" },
    result: empty,
    badResult: 1,
  },
  "logs.read": {
    params: { playground: "demo", since: "r_1:12", tail: 200, raw: false },
    badParams: { playground: "demo", since: "12" },
    result: {
      entries: [{ at: 1_760_000_000_000, kind: "stdout", text: "ready" }],
      cursor: "r_1:13",
      truncated: false,
      state: "ready",
    },
    badResult: { entries: [], cursor: "r_1:13" },
  },
  "logs.follow": {
    params: { playground: "demo", tail: 20 },
    badParams: { playground: "demo", tail: 0 },
    result: subscription,
    badResult: empty,
  },
  "logs.clear": {
    params: { playground: "demo" },
    badParams: empty,
    result: empty,
    badResult: false,
  },
  "toolchain.check": {
    params: { playground: "demo", cachedOnly: true },
    badParams: { cachedOnly: "yes" },
    result: report,
    badResult: { tools: [{ tool: "node" }] },
  },
  "toolchain.doctor": { params: empty, badParams: "all", result: report, badResult: empty },
  "toolchain.recheck": { params: empty, badParams: 0, result: report, badResult: empty },
  "toolchain.setPath": {
    params: { tool: "node", path: "/opt/node24/bin/node" },
    badParams: { tool: "node" },
    result: report,
    badResult: empty,
  },
  "settings.get": { params: empty, badParams: "x", result: sampleSettings, badResult: empty },
  "settings.set": {
    params: { cliIdleStopMinutes: 10 },
    badParams: { cliIdleStopMinutes: 0 },
    result: sampleSettings,
    badResult: { ...sampleSettings, updateCheck: "yes" },
  },
  "request.send": { params: { method: "GET" }, result: { status: 200 } },
  "request.getLast": { params: empty, result: null },
};

describe("方法登记表", () => {
  it("每个方法名恰好登记一次，名字是 group.name 或 ping 这样的小驼峰点号格式", () => {
    expect(new Set(methodNames).size).toBe(methodNames.length);
    for (const name of methodNames) expect(name).toMatch(/^[a-z]+(\.[a-zA-Z]+)?$/);
    expect(methodNames).toHaveLength(Object.keys(examples).length);
  });

  it("每个方法的分组是登记过的分组，名字前缀和分组对得上", () => {
    // 前缀到分组：ping、supervisor.* 属于会话，playground.* 属于资源库
    const groupOfPrefix: Record<string, string> = {
      ping: "session",
      supervisor: "session",
      session: "session",
      events: "events",
      playground: "library",
      library: "library",
      run: "run",
      logs: "logs",
      toolchain: "toolchain",
      settings: "settings",
      request: "request",
    };
    for (const name of methodNames) {
      const { group } = methodRegistry[name];
      expect(methodGroups).toContain(group);
      expect(group).toBe(groupOfPrefix[name.split(".")[0] as string]);
    }
  });

  it("握手帧 challenge、hello 不是方法；未登记的名字不被认作方法", () => {
    expect(isMethodName("challenge")).toBe(false);
    expect(isMethodName("hello")).toBe(false);
    expect(isMethodName("run.start")).toBe(true);
    expect(isMethodName("toString")).toBe(false);
  });

  it("方法可能返回的错误码都是已登记的错误码", () => {
    for (const name of methodNames) {
      for (const code of methodRegistry[name].errors) expect(isErrorCode(code)).toBe(true);
    }
  });

  it("只占名字的方法是 run.disown 和请求面板两个，管理进程回 NOT_SUPPORTED", () => {
    const reserved = methodNames.filter((name) => methodRegistry[name].status === "reserved");
    expect(reserved.sort()).toEqual(["request.getLast", "request.send", "run.disown"]);
    for (const name of reserved) expect(methodRegistry[name].errors).toEqual(["NOT_SUPPORTED"]);
  });

  it("[PROTOCOL-HANDSHAKE-16] 入参和出参的字段里没有 message、hint 这类面向用户的文字", () => {
    const forbidden = new Set(["message", "hint", "title", "body"]);
    const names = (node: unknown): string[] => {
      if (typeof node !== "object" || node === null) return [];
      const record = node as Record<string, unknown>;
      const own = Object.keys((record.properties as object | undefined) ?? {});
      return [...own, ...Object.values(record).flatMap(names)];
    };
    for (const name of methodNames) {
      const { params, result } = methodRegistry[name];
      for (const schema of [params, result]) {
        const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
        expect(names(json).filter((field) => forbidden.has(field))).toEqual([]);
      }
    }
  });
});

describe("每个方法的合法与非法样例", () => {
  for (const name of methodNames) {
    const example = examples[name];
    const { params, result } = methodRegistry[name];

    it(`${name}：合法的入参和出参通过`, () => {
      expect(params.safeParse(example.params).success).toBe(true);
      expect(result.safeParse(example.result).success).toBe(true);
    });

    if (methodRegistry[name].status === "reserved") continue;

    it(`${name}：非法的入参和出参被拒绝`, () => {
      expect(params.safeParse(example.badParams).success).toBe(false);
      expect(result.safeParse(example.badResult).success).toBe(false);
    });
  }
});

describe("入参的细节", () => {
  it("[PROTOCOL-HANDSHAKE-20] 入参里多出来的未知字段被忽略，不报错也不带出去", () => {
    for (const name of methodNames) {
      if (methodRegistry[name].status === "reserved") continue;
      const withExtra = { ...(examples[name].params as object), addedInTheFuture: 1 };
      const parsed = methodRegistry[name].params.safeParse(withExtra);
      expect(parsed.success).toBe(true);
      expect(parsed.data).not.toHaveProperty("addedInTheFuture");
    }
  });

  it("run.stop 在 runId 和 playground 里恰好给一个", () => {
    const { params } = methodRegistry["run.stop"];
    expect(params.safeParse({ playground: "demo" }).success).toBe(true);
    expect(params.safeParse({ runId: "r_1", playground: "demo" }).success).toBe(false);
    expect(params.safeParse({}).success).toBe(false);
  });

  it("[RUN-OWNERSHIP-04] run.adopt 只接受标签页持有者", () => {
    expect(methodRegistry["run.adopt"].params.safeParse({ runId: "r_1", owner: cli }).success).toBe(
      false,
    );
  });

  it("[RUN-LIFECYCLE-23] run.stopAll 的 mine 可省略", () => {
    expect(methodRegistry["run.stopAll"].params.safeParse({}).success).toBe(true);
  });

  it("[RUN-LIFECYCLE-11] run.start 的 timeoutMs 必须是正整数，端口必须合法", () => {
    const base = { playground: "demo", owner: cli, wait: "ready" };
    const { params } = methodRegistry["run.start"];
    expect(params.safeParse({ ...base, timeoutMs: 0 }).success).toBe(false);
    expect(params.safeParse({ ...base, port: 0 }).success).toBe(false);
  });

  it("[LIBRARY-PLAYGROUNDS-09] 名称的字符规则由 core 校验，schema 只要求非空（否则调用方拿到 USAGE 而不是 NAME_INVALID）", () => {
    const { params } = methodRegistry["playground.create"];
    const createdBy = { kind: "cli" };
    expect(params.safeParse({ template: "html", name: "My App", createdBy }).success).toBe(true);
    expect(params.safeParse({ template: "html", name: "", createdBy }).success).toBe(false);
  });

  it("[LIBRARY-PLAYGROUNDS-04] create 的结果用 created 区分新建和复用", () => {
    const { result } = methodRegistry["playground.create"];
    expect(result.parse({ playground: samplePlayground, created: false }).created).toBe(false);
  });

  it("[SUPERVISOR-LIFECYCLE-15] shutdown 的响应说明有没有关闭", () => {
    const { result } = methodRegistry["supervisor.shutdown"];
    expect(result.safeParse({ closing: false }).success).toBe(true);
  });

  it("[TOOLCHAIN-DETECTION-02] toolchain.check 可以只读缓存", () => {
    const { params } = methodRegistry["toolchain.check"];
    expect(params.safeParse({ template: "go", cachedOnly: true }).success).toBe(true);
  });

  it("[RUN-LOGS-16] logs.read 的游标来自上次的返回值，格式不对被拒绝", () => {
    const { params } = methodRegistry["logs.read"];
    expect(params.safeParse({ playground: "demo", since: "r_1:12" }).success).toBe(true);
    expect(params.safeParse({ playground: "demo", since: "r_1" }).success).toBe(false);
  });

  it("[RUN-LOGS-17] logs.read 的结果带 truncated，游标属于更早的运行时为 true", () => {
    const { result } = methodRegistry["logs.read"];
    const parsed = result.parse({ entries: [], cursor: "r_2:0", truncated: true });
    expect(parsed).toMatchObject({ truncated: true });
  });
});
