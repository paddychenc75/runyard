import { describe, expect, it } from "vitest";
import {
  envSourceSchema,
  envSources,
  failureReasonSchema,
  failureReasons,
  portFallbackReasonSchema,
  runStateSchema,
  runStates,
} from "./enums.ts";
import { isErrorCode } from "./errors.ts";

describe("枚举登记表", () => {
  it("运行状态是 §4.3 的 12 个名字，合法通过、非法被拒绝", () => {
    expect(runStates).toHaveLength(12);
    for (const s of runStates) expect(runStateSchema.safeParse(s).success).toBe(true);
    expect(runStateSchema.safeParse("Ready").success).toBe(false);
    expect(runStateSchema.safeParse("paused").success).toBe(false);
  });

  it("环境来源有 4 个值", () => {
    expect(envSources).toHaveLength(4);
    expect(envSourceSchema.safeParse("login-shell-degraded").success).toBe(true);
    expect(envSourceSchema.safeParse("shell").success).toBe(false);
  });

  it("失败原因都是已登记的错误码", () => {
    for (const reason of failureReasons) expect(isErrorCode(reason)).toBe(true);
    expect(failureReasonSchema.safeParse("SCRIPT_ERRORED").success).toBe(false);
  });

  it("PORT_RESERVED 只是端口回退的原因，不是错误码", () => {
    expect(portFallbackReasonSchema.safeParse("PORT_RESERVED").success).toBe(true);
    expect(isErrorCode("PORT_RESERVED")).toBe(false);
  });
});
