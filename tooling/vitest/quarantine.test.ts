import { describe, expect, it } from "vitest";
import { isExpired, loadQuarantine, quarantineId, validateEntries } from "./quarantine.ts";

const entry = {
  id: "packages/a/src/x.test.ts::组 > 用例",
  reason: "偶发超时",
  issue: 90,
  expires: "2026-11-01",
};

describe("隔离名单", () => {
  it("仓库里的名单格式合格", () => {
    expect(validateEntries(loadQuarantine(), "2000-01-01")).toEqual([]);
  });

  it("合格的项不报错；到期日当天仍有效", () => {
    expect(validateEntries([entry], "2026-11-01")).toEqual([]);
    expect(isExpired(entry, "2026-11-01")).toBe(false);
  });

  it("到期的项要报错，逼人修好或重新评审", () => {
    const errors = validateEntries([entry], "2026-11-02");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("已在 2026-11-01 到期");
    expect(isExpired(entry, "2026-11-02")).toBe(true);
  });

  it("缺原因、缺 issue、日期格式不对、id 重复都报错", () => {
    const errors = validateEntries(
      [
        { ...entry, reason: " " },
        { ...entry, id: "a::b", issue: undefined },
        { ...entry, id: "a::b", expires: "下周" },
      ],
      "2026-10-12",
    );
    expect(errors.join("\n")).toMatch(/缺 reason/);
    expect(errors.join("\n")).toMatch(/缺 issue/);
    expect(errors.join("\n")).toMatch(/YYYY-MM-DD/);
    expect(errors.join("\n")).toMatch(/重复/);
  });

  it("id 用 / 分隔路径，标题用 > 连接", () => {
    expect(quarantineId("packages\\a\\x.test.ts", ["组", "用例"])).toBe(
      "packages/a/x.test.ts::组 > 用例",
    );
  });
});
