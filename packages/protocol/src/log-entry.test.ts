import { describe, expect, it } from "vitest";
import { logEntrySchema } from "./log-entry.ts";

describe("LogEntry", () => {
  it.each(["stdout", "stderr", "command"] as const)("%s 条目带原样文本", (kind) => {
    expect(
      logEntrySchema.safeParse({ at: 1_700_000_000_000, kind, text: "line\u001b[31m" }).success,
    ).toBe(true);
  });

  it("system 条目带结构化提示，不带文本", () => {
    const entry = {
      at: 1,
      kind: "system",
      notice: { code: "IDLE_STOPPED", params: { minutes: 30 } },
    };
    expect(logEntrySchema.safeParse(entry).success).toBe(true);
    expect(logEntrySchema.safeParse({ at: 1, kind: "system", text: "idle" }).success).toBe(false);
  });

  it("拒绝：未知 kind、负的或带小数的时间、提示参数不合法", () => {
    expect(logEntrySchema.safeParse({ at: 1, kind: "stdin", text: "x" }).success).toBe(false);
    expect(logEntrySchema.safeParse({ at: -1, kind: "stdout", text: "x" }).success).toBe(false);
    expect(logEntrySchema.safeParse({ at: 1.5, kind: "stdout", text: "x" }).success).toBe(false);
    const bad = { at: 1, kind: "system", notice: { code: "IDLE_STOPPED", params: {} } };
    expect(logEntrySchema.safeParse(bad).success).toBe(false);
  });
});
