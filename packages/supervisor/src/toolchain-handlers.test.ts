import { ToolchainService } from "@runyard/core";
import { absPath } from "@runyard/platform";
import type { Settings, TemplateRecord, ToolDefinition } from "@runyard/protocol";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import type { RequestContext } from "./dispatch.ts";
import { MethodFailure } from "./method-failure.ts";
import { createToolchainHandlers } from "./toolchain-handlers.ts";

// toolchain.* 的处理函数：真的检测服务加假平台，设置和模板用最小的替身。
// 设置页“运行环境”表的后端（规格 DESKTOP-SETTINGS-15、16、17、18）。

const context = {} as RequestContext;

const baseSettings: Settings = {
  libraryRoot: "/Users/me/Runyard",
  packageManager: "auto",
  scriptAutoRun: true,
  cliIdleStopMinutes: 30,
  toolPaths: {},
  ports: { min: 7100, max: 7999 },
  urlNewSkipConfirmForBuiltin: false,
  updateCheck: true,
  autoSave: "delay",
  theme: "system",
  network: { noProxyLocal: true },
  confirmCloseRunningTab: true,
};

function definition(id: string, args: string[], pattern: string): ToolDefinition {
  return {
    formatVersion: 1,
    id,
    supported: ">=1",
    detect: { args, pattern },
    install: {
      darwin: { url: `https://example.com/${id}`, homebrew: { command: ["brew", "install", id] } },
    },
  };
}

const definitions = new Map([
  ["node", definition("node", ["--version"], "v(\\d+\\.\\d+\\.\\d+)")],
  ["go", definition("go", ["version"], "go version go(\\d+\\.\\d+(?:\\.\\d+)?)")],
  ["ruby", definition("ruby", ["--version"], "ruby (\\d+\\.\\d+\\.\\d+)")],
]);

function template(id: string, requires: TemplateRecord["requires"], valid = true): TemplateRecord {
  return {
    id,
    name: id,
    description: "",
    category: "mine",
    tags: [],
    source: "builtin",
    runner: "node-ts",
    kind: "server",
    requires,
    valid,
  };
}

function world(templates: TemplateRecord[]) {
  const fake = createFakePlatform();
  let settings: Settings = baseSettings;
  const published: string[] = [];
  const service = new ToolchainService({
    platform: fake.platform,
    clock: fake.clock,
    definitions,
    toolPaths: () => settings.toolPaths,
    onChanged: () => undefined,
  });
  const handlers = createToolchainHandlers({
    api: {
      readSettings: async () => settings,
      updateSettings: async (patch: Partial<Settings>) => {
        settings = { ...settings, ...patch };
        return settings;
      },
      publish: (event: string) => {
        published.push(event);
      },
    } as never,
    toolchain: () => Promise.resolve(service),
    templates: { list: async () => templates, get: async () => undefined },
    refreshSettings: async () => undefined,
  });
  /** 假时钟不推就不前进，所以边等边推 */
  async function settle<T>(promise: Promise<T>): Promise<T> {
    let done = false;
    const outcome = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    void outcome.then(() => {
      done = true;
    });
    for (let i = 0; i < 200 && !done; i++) {
      await fake.clock.advance(50);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const settled = await outcome;
    if (!settled.ok) throw settled.error;
    return settled.value;
  }
  return { fake, handlers, settle, published, settings: () => settings };
}

const check = (w: ReturnType<typeof world>, params = {}) =>
  w.settle(w.handlers["toolchain.check"]?.(params, context) as Promise<{ tools: never[] }>);

describe("toolchain.check 不指定项目和模板", () => {
  it("[DESKTOP-SETTINGS-15] 只列模板用到的工具，本机装了但没人用的 ruby 不在里面", async () => {
    const w = world([
      template("a", { node: { version: ">=22" } }),
      template("b", { node: { version: ">=20" }, go: { version: ">=1.22 <2" } }),
      template("broken", { ruby: { version: ">=3" } }, false),
    ]);
    w.fake.tools.install("node", { version: "24.1.0" });
    w.fake.tools.install("go", { version: "1.26.1" });
    w.fake.tools.install("ruby", { version: "3.3.0" });
    const report = await check(w);
    expect(report.tools.map((tool: { tool: string }) => tool.tool)).toEqual(["node", "go"]);
  });

  it("[DESKTOP-SETTINGS-16] cachedOnly 只读缓存，不起任何进程；有缓存时给出上次的结果", async () => {
    const w = world([template("a", { node: { version: ">=22" } })]);
    w.fake.tools.install("node", { version: "24.1.0" });
    const cold = await check(w, { cachedOnly: true });
    expect(cold.tools[0]).toMatchObject({ tool: "node", status: "unknown" });
    expect(w.fake.processes.spawned).toHaveLength(0);
    await check(w);
    const spawned = w.fake.processes.spawned.length;
    const warm = await check(w, { cachedOnly: true });
    expect(warm.tools[0]).toMatchObject({ tool: "node", status: "found", version: "24.1.0" });
    expect(w.fake.processes.spawned).toHaveLength(spawned);
  });

  it("[DESKTOP-SETTINGS-17] 缺少的工具带需要的版本、当前系统的安装命令和官网", async () => {
    const w = world([template("a", { go: { version: ">=1.22 <2" } })]);
    w.fake.tools.missing("go");
    const report = await check(w);
    expect(report.tools[0]).toMatchObject({
      tool: "go",
      status: "missing",
      required: ">=1.22 <2",
      installCommand: "brew install go",
      installUrl: "https://example.com/go",
    });
  });

  it("没有任何有效模板时是空表", async () => {
    const w = world([]);
    expect((await check(w)).tools).toEqual([]);
  });
});

describe("toolchain.setPath", () => {
  it("[DESKTOP-SETTINGS-18] 选了一个打印不出版本号的文件：报 TOOL_PATH_INVALID，设置里的路径不变", async () => {
    const w = world([template("a", { node: { version: ">=22" } })]);
    const good = w.fake.tools.install("node", {
      version: "24.1.0",
      path: absPath("/opt/node/bin/node"),
    });
    await w.settle(
      w.handlers["toolchain.setPath"]?.({ tool: "node", path: good }, context) as Promise<unknown>,
    );
    expect(w.settings().toolPaths).toEqual({ node: good });

    const failure = await w
      .settle(
        w.handlers["toolchain.setPath"]?.(
          { tool: "node", path: "/Users/me/not-node" },
          context,
        ) as Promise<unknown>,
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MethodFailure);
    expect((failure as MethodFailure).error).toMatchObject({
      code: "TOOL_PATH_INVALID",
      params: { tool: "node", path: "/Users/me/not-node" },
    });
    expect(w.settings().toolPaths).toEqual({ node: good });
  });

  it("接受之后返回新的检测结果并发 toolchain.changed", async () => {
    const w = world([template("a", { node: { version: ">=22" } })]);
    const path = w.fake.tools.install("node", {
      version: "25.6.0",
      path: absPath("/opt/node/bin/node"),
    });
    const report = (await w.settle(
      w.handlers["toolchain.setPath"]?.({ tool: "node", path }, context) as Promise<{
        tools: { tool: string; path?: string }[];
      }>,
    )) as { tools: { tool: string; path?: string }[] };
    expect(report.tools.find((tool) => tool.tool === "node")?.path).toBe(path);
    expect(w.published).toContain("toolchain.changed");
  });
});

// 模板详情按模板查：cachedOnly 原样交给检测服务，不另外触发检测（规格 DESKTOP-TEMPLATES-VIEW-04）。
describe("toolchain.check 按模板查", () => {
  const requires = { node: { version: ">=22 <27" } };
  function setup() {
    const calls: unknown[] = [];
    const service = {
      check: async (request: unknown) => {
        calls.push(request);
        return {
          tools: [{ tool: "node", status: "unknown" }],
          errors: [],
          notices: [],
          fallbacks: [],
        };
      },
    } as unknown as ToolchainService;
    const handlers = createToolchainHandlers({
      api: {} as never,
      toolchain: () => Promise.resolve(service),
      templates: {
        list: async () => [],
        get: async (id: string) =>
          id === "react19"
            ? ({ template: { requires }, path: "/t", files: [] } as never)
            : undefined,
      },
    });
    const handler = handlers["toolchain.check"];
    if (handler === undefined) throw new Error("handler missing");
    return { calls, call: (params: Parameters<typeof handler>[0]) => handler(params, context) };
  }

  it("[DESKTOP-TEMPLATES-VIEW-04] cachedOnly 为真时交给检测服务的请求带 cachedOnly，不触发检测", async () => {
    const { calls, call } = setup();
    expect(await call({ template: "react19", cachedOnly: true })).toEqual({
      tools: [{ tool: "node", status: "unknown" }],
    });
    expect(calls).toEqual([{ requires, cachedOnly: true }]);
  });

  it("没有 cachedOnly 时是实时检测", async () => {
    const { calls, call } = setup();
    await call({ template: "react19" });
    expect(calls).toEqual([{ requires }]);
  });

  it("模板不存在报 TEMPLATE_NOT_FOUND；按项目查目前不支持，报 NOT_SUPPORTED", async () => {
    const { call } = setup();
    await expect(call({ template: "nope" })).rejects.toMatchObject({
      error: { code: "TEMPLATE_NOT_FOUND" },
    });
    await expect(call({ playground: "p" })).rejects.toMatchObject({
      error: { code: "NOT_SUPPORTED" },
    });
  });
});
