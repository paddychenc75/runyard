import { describe, expect, it } from "vitest";
import { createdBySchema } from "./created-by.ts";

describe("CreatedBy", () => {
  it("[LIBRARY-PLAYGROUNDS-02] 智能体创建的带名字和命令", () => {
    expect(
      createdBySchema.safeParse({ kind: "agent", agent: "Claude Code", command: "new react19" })
        .success,
    ).toBe(true);
    expect(createdBySchema.safeParse({ kind: "user" }).success).toBe(true);
  });

  it("种类只有 user、agent、cli", () => {
    expect(createdBySchema.safeParse({ kind: "tab" }).success).toBe(false);
    expect(createdBySchema.safeParse({ agent: "x" }).success).toBe(false);
  });
});
