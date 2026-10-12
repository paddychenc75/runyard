import { describe, expect, it } from "vitest";
import {
  envSourceSchema,
  envSources,
  failureReasonSchema,
  failureReasons,
  portFallbackReasonSchema,
  runKindSchema,
  runKinds,
  runStateSchema,
  runStates,
  toolStatuses,
  toolStatusSchema,
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

describe("枚举登记表：运行种类与工具检测结论", () => {
  it("运行种类有 server、static、oneshot 三个", () => {
    expect(runKinds).toEqual(["server", "static", "oneshot"]);
    expect(runKindSchema.safeParse("oneshot").success).toBe(true);
    expect(runKindSchema.safeParse("script").success).toBe(false);
  });

  it("工具检测结论有 4 个值", () => {
    expect(toolStatuses).toEqual(["found", "missing", "too-old", "unknown"]);
    expect(toolStatusSchema.safeParse("too-old").success).toBe(true);
    expect(toolStatusSchema.safeParse("old").success).toBe(false);
  });
});
