import type { Requires } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import {
  evaluateRequirements,
  type ToolObservation,
  toolsToDetect,
} from "./evaluate-requirements.ts";

const found = (tool: string, version: string): ToolObservation => ({
  tool,
  state: "found",
  path: `/bin/${tool}`,
  version,
});
const missing = (tool: string): ToolObservation => ({ tool, state: "missing" });
const observed = (...list: ToolObservation[]) => new Map(list.map((o) => [o.tool, o]));

describe("evaluateRequirements", () => {
  const requires: Requires = { node: { version: ">=20.19 <27" } };

  it("unknown（只读缓存没有）不产生错误和提醒", () => {
    const result = evaluateRequirements(requires, new Map());
    expect(result.tools).toEqual([{ tool: "node", status: "unknown", required: ">=20.19 <27" }]);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
  });

  it("回退用的工具也在结果里，原工具如实标 missing", () => {
    const withFallback: Requires = { pnpm: { version: ">=10", fallback: "npm" } };
    const result = evaluateRequirements(
      withFallback,
      observed(missing("pnpm"), found("npm", "10.9.0")),
    );
    expect(result.tools.map((t) => [t.tool, t.status])).toEqual([
      ["pnpm", "missing"],
      ["npm", "found"],
    ]);
    expect(result.fallbacks).toEqual([{ wanted: "pnpm", used: "npm" }]);
  });

  it("回退的工具也没有时，报原工具的 TOOL_MISSING", () => {
    const withFallback: Requires = { pnpm: { version: ">=10", fallback: "npm" } };
    const result = evaluateRequirements(withFallback, observed(missing("pnpm"), missing("npm")));
    expect(result.errors.map((e) => e.code)).toEqual(["TOOL_MISSING"]);
    expect(result.errors[0]?.params).toEqual({ tool: "pnpm", required: ">=10" });
  });

  it("[TEMPLATES-CUSTOM-21] 缺工具和版本过低都带上项目自己写的 install（命令连成一行），没写就没有这两个参数", () => {
    const install = {
      command: ["brew", "install", "my tool"],
      url: "https://ziglang.org/download/",
    };
    const wanted: Requires = { zig: { version: ">=0.14", install } };
    const missingResult = evaluateRequirements(wanted, observed(missing("zig")));
    expect(missingResult.errors[0]?.params).toEqual({
      tool: "zig",
      required: ">=0.14",
      installCommand: 'brew install "my tool"',
      installUrl: "https://ziglang.org/download/",
    });
    const oldResult = evaluateRequirements(wanted, observed(found("zig", "0.13.0")));
    expect(oldResult.errors[0]?.params).toMatchObject({
      found: "0.13.0",
      installCommand: 'brew install "my tool"',
    });
    const bare = evaluateRequirements({ zig: { version: ">=0.14" } }, observed(missing("zig")));
    expect(bare.errors[0]?.params).toEqual({ tool: "zig", required: ">=0.14" });
  });

  it("pnpm 太旧不能靠回退绕过", () => {
    const withFallback: Requires = { pnpm: { version: ">=10", fallback: "npm" } };
    const result = evaluateRequirements(
      withFallback,
      observed(found("pnpm", "8.0.0"), found("npm", "10.9.0")),
    );
    expect(result.errors.map((e) => e.code)).toEqual(["TOOL_TOO_OLD"]);
    expect(result.fallbacks).toEqual([]);
  });

  it("toolsToDetect 包含回退的工具且不重复", () => {
    const withFallback: Requires = {
      pnpm: { version: ">=10", fallback: "npm" },
      npm: { version: ">=10" },
    };
    expect(toolsToDetect(withFallback).sort()).toEqual(["npm", "pnpm"]);
  });
});
