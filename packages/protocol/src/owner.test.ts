import { describe, expect, it } from "vitest";
import { cliOwnerSchema, ownerSchema, tabOwnerSchema } from "./owner.ts";

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

describe("Owner 的两个分支", () => {
  it("tabOwnerSchema 只收 tab，cliOwnerSchema 只收 cli", () => {
    const tab = { kind: "tab", clientId: "c1", tabId: "t1" };
    const cli = { kind: "cli", command: "run demo" };
    expect(tabOwnerSchema.safeParse(tab).success).toBe(true);
    expect(tabOwnerSchema.safeParse(cli).success).toBe(false);
    expect(cliOwnerSchema.safeParse(cli).success).toBe(true);
    expect(cliOwnerSchema.safeParse(tab).success).toBe(false);
  });
});
