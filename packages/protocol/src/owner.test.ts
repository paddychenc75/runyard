import { describe, expect, it } from "vitest";
import { ownerSchema } from "./owner.ts";

describe("Owner", () => {
  it("tab 持有者需要 clientId 和 tabId", () => {
    expect(ownerSchema.safeParse({ kind: "tab", clientId: "c1", tabId: "t1" }).success).toBe(true);
    expect(ownerSchema.safeParse({ kind: "tab", clientId: "c1" }).success).toBe(false);
  });

  it("cli 持有者的 agent 可选，command 必填", () => {
    expect(ownerSchema.safeParse({ kind: "cli", command: "run demo" }).success).toBe(true);
    expect(
      ownerSchema.safeParse({ kind: "cli", agent: "Claude Code", command: "run demo" }).success,
    ).toBe(true);
    expect(ownerSchema.safeParse({ kind: "cli" }).success).toBe(false);
  });

  it("拒绝未知种类", () => {
    expect(ownerSchema.safeParse({ kind: "app", command: "x" }).success).toBe(false);
  });
});
