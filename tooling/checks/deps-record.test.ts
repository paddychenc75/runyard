import { describe, expect, it } from "vitest";
import { depsRecord, parseRecord } from "./deps-record.ts";
import { GOOD_WORKSPACE, makeRepo } from "./test-helpers.ts";

const HEADER =
  "| 包 | 选定版本 | 发布日期 | 查询日期 | 公告查询 | 为什么是这个版本 |\n| --- | --- | --- | --- | --- | --- |\n";
const row = (pkg: string, version: string, advisory = "无（A、B、C）", why = "测试") =>
  `| ${pkg} | ${version} | 2026-09-13 | 2026-10-12 | ${advisory} | ${why} |\n`;

function repo(record: string, dependencies: Record<string, string> = { zod: "catalog:" }): string {
  return makeRepo({
    "pnpm-workspace.yaml": GOOD_WORKSPACE,
    "package.json": { name: "root", dependencies },
    "docs/architecture/dependencies.md": record,
  });
}

describe("deps-record 检查", () => {
  it("每个直接依赖都有行且版本一致时通过", () => {
    expect(depsRecord.run(repo(HEADER + row("zod", "**4.6.5**")))).toEqual([]);
  });

  it("缺少行", () => {
    expect(depsRecord.run(repo(HEADER + row("other", "1.0.0"))).join()).toContain("没有它的行");
  });

  it("版本不一致", () => {
    expect(depsRecord.run(repo(HEADER + row("zod", "4.6.4"))).join()).toContain("写的是 4.6.4");
  });

  it("公告查询为空", () => {
    expect(depsRecord.run(repo(HEADER + row("zod", "4.6.5", ""))).join()).toContain("公告查询");
  });

  it("例外行没有公告编号", () => {
    const record = HEADER + row("zod", "4.6.5", "无", "安全修复例外");
    expect(depsRecord.run(repo(record)).join()).toContain("没有公告编号");
    const ok = HEADER + row("zod", "4.6.5", "GHSA-rq7h-c2jc-7f22", "安全修复例外");
    expect(depsRecord.run(repo(ok))).toEqual([]);
  });

  it("解析表格时忽略分隔行和正文", () => {
    expect(parseRecord(`# 标题\n${HEADER}${row("`a`", "1.0.0")}`).get("a")?.version).toBe("1.0.0");
  });
});
