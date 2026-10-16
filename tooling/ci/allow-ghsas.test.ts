import { describe, expect, it } from "vitest";
import { allowedGhsas } from "./allow-ghsas.ts";

const TODAY = new Date("2026-10-16T08:00:00Z");
const entry = (id: string, scope: string, expires: string, extra = "") => `
[[allow]]
id = "${id}"
scope = "${scope}"
package = "braces"
reason = "只影响开发时工具"
expires = ${expires}
${extra}`;
const APPROVED = 'owner_approved = "§12 第 30 项，2026-10-12"';

describe("allow-ghsas：允许清单交给依赖变更审查的编号", () => {
  it("好样例：只取 root 范围的 GHSA 编号", () => {
    const text =
      entry("GHSA-vfj7-8cjw-p6xm", "root", "2026-12-15", APPROVED) +
      entry("GHSA-2222-3333-4444", "template:nuxt", "2026-11-01");
    expect(allowedGhsas(text, TODAY)).toEqual({ ids: ["GHSA-vfj7-8cjw-p6xm"], errors: [] });
  });

  it("没有条目时编号为空", () => {
    expect(allowedGhsas("# 没有条目\n", TODAY)).toEqual({ ids: [], errors: [] });
  });

  it("坏样例：条目已过期时不放行任何编号，并报错", () => {
    const result = allowedGhsas(entry("GHSA-vfj7-8cjw-p6xm", "root", "2026-10-01"), TODAY);
    expect(result.ids).toEqual([]);
    expect(result.errors.join()).toContain("过期");
  });

  it("坏样例：期限超过 30 天又没有负责人批准字段时不放行", () => {
    const result = allowedGhsas(entry("GHSA-vfj7-8cjw-p6xm", "root", "2026-12-15"), TODAY);
    expect(result.ids).toEqual([]);
    expect(result.errors.join()).toContain("期限超过上限");
  });
});
