import { describe, expect, it } from "vitest";
import { checkAllowlist, parseAllowlist } from "./allowlist.ts";

const TODAY = new Date("2026-10-12T08:00:00Z");

const entry = (extra = "", expires = "2026-11-01") => `
[[allow]]
id = "GHSA-vfj7-8cjw-p6xm"
scope = "root"
package = "demo"
reason = "没有修复版本"   # 行尾注释
expires = ${expires}
${extra}`;

describe("allowlist", () => {
  it("空文件（只有注释）通过", () => {
    expect(checkAllowlist("# 说明\n", TODAY)).toEqual([]);
  });

  it("合法条目通过", () => {
    expect(checkAllowlist(entry(), TODAY)).toEqual([]);
  });

  it("缺字段报错", () => {
    const text = '[[allow]]\nid = "GHSA-vfj7-8cjw-p6xm"\n';
    expect(checkAllowlist(text, TODAY)[0]).toContain("缺少字段");
  });

  it("已过期报错", () => {
    expect(checkAllowlist(entry("", "2026-10-01"), TODAY)[0]).toContain("已于 2026-10-01 过期");
  });

  it("超过 30 天上限报错，owner_approved 放宽到 60 天", () => {
    expect(checkAllowlist(entry("", "2026-12-14"), TODAY)[0]).toContain("上限 30 天");
    const approved = 'owner_approved = "§12 第 30 项，2026-10-12"';
    expect(checkAllowlist(entry(approved, "2026-12-11"), TODAY)).toEqual([]);
    expect(checkAllowlist(entry(approved, "2026-12-14"), TODAY)[0]).toContain("上限 60 天");
  });

  it("owner_approved 没指向 §12 时报错", () => {
    expect(
      checkAllowlist(entry('owner_approved = "老板说行"'), TODAY).some((e) => e.includes("§12")),
    ).toBe(true);
  });

  it("认不出的写法直接报错", () => {
    expect(parseAllowlist("foo = [1, 2]\n").errors.length).toBe(1);
  });
});
