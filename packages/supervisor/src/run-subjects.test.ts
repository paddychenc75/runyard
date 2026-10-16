import { describe, expect, it } from "vitest";
import { requiresOf } from "./run-subjects.ts";

describe("requiresOf", () => {
  it("[TEMPLATES-CUSTOM-21] playground.json 里存的 install 回到对应工具的条目，其余工具只有版本范围", () => {
    expect(
      requiresOf({
        requires: { node: ">=22.18", zig: ">=0.14" },
        requiresInstall: { zig: { command: ["brew", "install", "zig"] } },
      }),
    ).toEqual({
      node: { version: ">=22.18" },
      zig: { version: ">=0.14", install: { command: ["brew", "install", "zig"] } },
    });
  });

  it("旧项目没有 requiresInstall 字段，照常读", () => {
    expect(requiresOf({ requires: { node: ">=22.18" } })).toEqual({ node: { version: ">=22.18" } });
  });
});
