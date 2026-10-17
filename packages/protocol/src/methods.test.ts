import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isErrorCode } from "./errors.ts";
import { methodGroups } from "./method-definition.ts";
import { isMethodName, type MethodName, methodNames, methodRegistry } from "./methods.ts";
import {
  samplePlayground,
  sampleRun,
  sampleSettings,
  sampleTemplateRecord,
} from "./sample-data.ts";

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
    result: {
      playground: samplePlayground,
      created: true,
      notices: [{ code: "PATH_NEAR_LIMIT", params: { length: 240, limit: 260 } }],
    },
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
  "run.stdin": {
    params: { runId: "r_1", data: "abc\n" },
    badParams: { runId: "r_1" },
    result: empty,
    badResult: "written",
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
  "template.list": {
    params: empty,
    badParams: "all",
    result: [sampleTemplateRecord],
    badResult: [{ ...sampleTemplateRecord, source: "builtin-ish" }],
  },
  "template.get": {
    params: { id: "react19" },
    badParams: { id: "" },
    result: {
      template: sampleTemplateRecord,
      path: "/Applications/Runyard.app/templates/react19",
      files: ["package.json", "src/App.tsx"],
      runner: {
        setup: { pnpm: ["pnpm", "install"] },
        run: ["node", "server.js", "{port}"],
        ready: { http: { path: "/" }, slowAfterMs: 30000 },
      },
      problems: [],
    },
    badResult: {
      template: sampleTemplateRecord,
      path: "/x",
      files: ["../escape"],
      runner: null,
      problems: [],
    },
  },
  "template.save": {
    params: {
      playground: "pricing-table",
      as: "my-pricing",
      name: "My pricing",
      replaceName: true,
      include: [".env"],
      exclude: ["src/secret.ts"],
    },
    badParams: { playground: "pricing-table", as: "" },
    result: {
      id: "my-pricing",
      name: "My pricing",
      path: "/Users/someone/.runyard/templates/my-pricing",
      files: ["src/App.tsx"],
      source: "user",
    },
    badResult: {
      id: "my-pricing",
      name: "My pricing",
      path: "/x",
      files: [],
      source: "builtin",
    },
  },
  "clean.due": {
    params: empty,
    badParams: [],
    result: { remind: ["p1"], clean: ["p2"] },
    badResult: { remind: ["p1"] },
  },
  "clean.ackReminder": {
    params: { playgroundId: "p1" },
    badParams: { playgroundId: "" },
    result: empty,
    badResult: "ok",
  },
  "clean.keep": {
    params: { playgroundId: "p1" },
    badParams: {},
    result: empty,
    badResult: null,
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
      template: "template",
      clean: "clean",
      settings: "settings",
      request: "request",
    };
    for (const name of methodNames) {
      const { group } = methodRegistry[name];
      expect(methodGroups).toContain(group);
      expect(group).toBe(groupOfPrefix[name.split(".")[0] as string]);
    }
  });

  it("run.stdin 可能返回 RUN_NOT_FOUND（没有或已结束的运行）和 NOT_SUPPORTED（服务不接收）", () => {
    expect(methodRegistry["run.stdin"].errors).toEqual(["RUN_NOT_FOUND", "NOT_SUPPORTED"]);
  });

  it("run.stdin 的 data 原样传，可以不带换行，也可以是空串", () => {
    const { params } = methodRegistry["run.stdin"];
    expect(params.parse({ runId: "r_1", data: "abc" })).toEqual({ runId: "r_1", data: "abc" });
    expect(params.safeParse({ runId: "r_1", data: "" }).success).toBe(true);
    expect(params.safeParse({ runId: "r_1", data: 3 }).success).toBe(false);
  });

  it("clean.due 的结果是两份清单：待提醒和可清理", () => {
    const { result } = methodRegistry["clean.due"];
    expect(result.safeParse({ remind: [], clean: [] }).success).toBe(true);
    expect(result.safeParse({ remind: [] }).success).toBe(false);
  });

  it("回报提醒显示和改为保留只带项目 id", () => {
    for (const name of ["clean.ackReminder", "clean.keep"] as const) {
      expect(methodRegistry[name].params.safeParse({ playgroundId: "p1" }).success).toBe(true);
      expect(methodRegistry[name].params.safeParse({ playground: "demo" }).success).toBe(false);
    }
  });

  it("[TEMPLATES-CUSTOM-03] template.save 的标识写法由管理进程校验并回 NAME_INVALID，schema 只要求非空；include、exclude 路径由 schema 把关", () => {
    const { params } = methodRegistry["template.save"];
    for (const as of ["My_Template", "-a", "a-"])
      expect(params.safeParse({ playground: "demo", as }).success).toBe(true);
    expect(params.safeParse({ playground: "demo", as: "" }).success).toBe(false);
    for (const path of ["../outside", "/etc/passwd"]) {
      expect(params.safeParse({ playground: "demo", as: "ok", include: [path] }).success).toBe(
        false,
      );
      expect(params.safeParse({ playground: "demo", as: "ok", exclude: [path] }).success).toBe(
        false,
      );
    }
    expect(
      params.safeParse({ playground: "demo", as: "ok", include: [".env"], exclude: ["src/a.ts"] })
        .success,
    ).toBe(true);
  });

  it("用无效的模板创建项目会得到 TEMPLATE_INVALID", () => {
    expect(methodRegistry["playground.create"].errors).toContain("TEMPLATE_INVALID");
  });

  it("template.list 的记录带 valid；无效模板读不出的字段取缺省值", () => {
    const { result } = methodRegistry["template.list"];
    const broken = { ...sampleTemplateRecord, valid: false, runner: "", kind: null };
    expect(result.safeParse([sampleTemplateRecord, broken]).success).toBe(true);
    expect(result.safeParse([{ ...sampleTemplateRecord, valid: undefined }]).success).toBe(false);
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

  it("按 runId 找运行的方法都声明了 RUN_NOT_FOUND", () => {
    for (const name of ["run.stop", "run.get", "run.adopt", "run.attach", "run.detach"] as const) {
      expect(methodRegistry[name].errors).toContain("RUN_NOT_FOUND");
    }
  });

  it("会写共享文件的方法声明 DATA_FROM_NEWER_VERSION，只读的方法不声明", () => {
    const declared = methodNames.filter((name) =>
      (methodRegistry[name].errors as readonly string[]).includes("DATA_FROM_NEWER_VERSION"),
    );
    expect(declared.sort()).toEqual([
      "clean.ackReminder",
      "clean.keep",
      "library.rescan",
      "playground.create",
      "playground.duplicate",
      "playground.forget",
      "playground.relocate",
      "playground.rename",
      "playground.trash",
      "playground.update",
      "run.restart",
      "run.start",
      "settings.set",
      "toolchain.setPath",
    ]);
    for (const readOnly of [
      "playground.list",
      "playground.get",
      "settings.get",
      "run.get",
    ] as const)
      expect(methodRegistry[readOnly].errors).not.toContain("DATA_FROM_NEWER_VERSION");
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
