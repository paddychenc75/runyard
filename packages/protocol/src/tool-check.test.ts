import { describe, expect, it } from "vitest";
import { toolCheckSchema, toolchainReportSchema } from "./tool-check.ts";

describe("工具检测结果", () => {
  it("[TOOLCHAIN-DETECTION-04] 找到的工具带路径、版本和来源", () => {
    const found = {
      tool: "node",
      status: "found",
      path: "/opt/node24/bin/node",
      version: "24.21.0",
      source: "login-shell",
    };
    expect(toolCheckSchema.safeParse(found).success).toBe(true);
  });

  it("[TOOLCHAIN-DETECTION-02] 只读缓存而缓存里没有：状态是 unknown，没有路径和版本", () => {
    expect(toolCheckSchema.safeParse({ tool: "python", status: "unknown" }).success).toBe(true);
  });

  it("[TOOLCHAIN-DETECTION-08] 版本过低带要求的范围；[TOOLCHAIN-DETECTION-09] 版本过高仍是 found 并带 untested", () => {
    const tooOld = { tool: "node", status: "too-old", version: "20.10.0", required: ">=20.19 <27" };
    expect(toolCheckSchema.safeParse(tooOld).success).toBe(true);
    const untested = { tool: "node", status: "found", version: "28.0.0", untested: true };
    expect(toolCheckSchema.safeParse(untested).success).toBe(true);
  });

  it("工具标识是开放集合，但状态、来源必须是登记过的值", () => {
    expect(toolCheckSchema.safeParse({ tool: "zig", status: "missing" }).success).toBe(true);
    expect(toolCheckSchema.safeParse({ tool: "zig", status: "installed" }).success).toBe(false);
    expect(
      toolCheckSchema.safeParse({ tool: "zig", status: "found", source: "shell" }).success,
    ).toBe(false);
    expect(toolCheckSchema.safeParse({ tool: "", status: "missing" }).success).toBe(false);
  });

  it("报告是 tools 数组", () => {
    expect(toolchainReportSchema.safeParse({ tools: [] }).success).toBe(true);
    expect(toolchainReportSchema.safeParse([]).success).toBe(false);
  });
});
