import type { ToolchainService } from "@runyard/core";
import { describe, expect, it } from "vitest";
import type { RequestContext } from "./dispatch.ts";
import { MethodFailure } from "./method-failure.ts";
import type { TemplateLibrary } from "./template-library.ts";
import { createToolchainHandlers } from "./toolchain-handlers.ts";

// toolchain.check 按模板查：cachedOnly 原样交给检测服务，不另外触发检测（规格 DESKTOP-TEMPLATES-VIEW-04）。

const requires = { node: { version: ">=22 <27" } };
const templates = {
  get: async (id: string) =>
    id === "react19" ? { template: { requires }, path: "/t", files: [] } : undefined,
} as unknown as TemplateLibrary;

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
  const handler = createToolchainHandlers(templates, () => Promise.resolve(service))[
    "toolchain.check"
  ];
  if (handler === undefined) throw new Error("handler missing");
  const context = {} as RequestContext;
  return { calls, call: (params: Parameters<typeof handler>[0]) => handler(params, context) };
}

describe("toolchain.check", () => {
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
    await expect(call({ playground: "p" })).rejects.toBeInstanceOf(MethodFailure);
    await expect(call({ playground: "p" })).rejects.toMatchObject({
      error: { code: "NOT_SUPPORTED" },
    });
  });
});
