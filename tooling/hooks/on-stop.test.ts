import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isStopContinuation } from "./hook-input.ts";

// 输入形状取自官方文档 code.claude.com/docs/en/hooks 的 Stop input 示例
const stopInput = (active: boolean) => ({
  session_id: "abc123",
  cwd: "/tmp",
  hook_event_name: "Stop",
  stop_hook_active: active,
  last_assistant_message: "完成",
});

describe("on-stop 钩子的 stop_hook_active", () => {
  it("字段为 true 才算已在因结束钩子而继续", () => {
    expect(isStopContinuation(stopInput(true))).toBe(true);
    expect(isStopContinuation(stopInput(false))).toBe(false);
    expect(isStopContinuation({})).toBe(false);
  });

  it("stop_hook_active 为 true 时直接退出 0，并在标准错误里给一行警告", () => {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "on-stop.ts")], {
      input: JSON.stringify(stopInput(true)),
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("警告");
  });
});
