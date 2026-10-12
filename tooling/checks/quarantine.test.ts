import { describe, expect, it } from "vitest";
import { quarantine } from "./quarantine.ts";
import { makeRepo } from "./test-helpers.ts";

const FILE = "tooling/vitest/quarantine.json";

describe("quarantine 检查", () => {
  it("空名单和没到期的项通过", () => {
    expect(quarantine.run(makeRepo({ [FILE]: "[]" }))).toEqual([]);
    const entry = { id: "a.test.ts::x", reason: "偶发", issue: 1, expires: "2999-01-01" };
    expect(quarantine.run(makeRepo({ [FILE]: JSON.stringify([entry]) }))).toEqual([]);
  });

  it("已到期的项让检查失败，并说明怎么办", () => {
    const entry = { id: "a.test.ts::x", reason: "偶发", issue: 1, expires: "2020-01-01" };
    const errors = quarantine.run(makeRepo({ [FILE]: JSON.stringify([entry]) }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("已在 2020-01-01 到期");
  });

  it("名单读不出来时报错", () => {
    expect(quarantine.run(makeRepo({ [FILE]: "不是 JSON" }))).toHaveLength(1);
  });
});
