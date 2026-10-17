import { describe, expect, it } from "vitest";
import { parseLink } from "./parse-link.ts";

describe("runyard:// 链接解析", () => {
  it("[DESKTOP-LINKS-01] open 链接取出项目名称", () => {
    expect(parseLink("runyard://open/demo")).toEqual({ kind: "open", name: "demo" });
  });

  it("[DESKTOP-LINKS-04] 名称里的路径、编码出来的斜线和空名称都不合法", () => {
    for (const bad of [
      "runyard://open/..%2Fetc",
      "runyard://open/a%2Fb",
      "runyard://open/",
      "runyard://open/Demo",
      "runyard://open/%E0%A4%A",
      "runyard://open/demo/extra",
    ]) {
      expect(parseLink(bad)).toEqual({ kind: "invalid", reason: "name", value: null });
    }
  });

  it("[DESKTOP-LINKS-12] new 链接只留下模板、名称、备注、清理天数和来源，其余参数丢掉", () => {
    const link = parseLink(
      "runyard://new/html?name=landing&note=%E9%A6%96%E9%A1%B5&clean-after=7d&source=docs.example.dev&cmd=rm%20-rf&path=/tmp",
    );
    expect(link).toEqual({
      kind: "new",
      template: "html",
      name: "landing",
      note: "首页",
      cleanAfter: 7,
      source: "docs.example.dev",
    });
    expect(JSON.stringify(link)).not.toContain("rm");
    expect(JSON.stringify(link)).not.toContain("/tmp");
  });

  it("[DESKTOP-LINKS-12] 清理天数写法不对就当没写；来源去掉控制字符和方向控制符并限长", () => {
    const link = parseLink(
      `runyard://new/html?clean-after=forever&source=${encodeURIComponent(`a‮b\nc${"x".repeat(200)}`)}`,
    );
    expect(link.kind).toBe("new");
    if (link.kind !== "new") return;
    expect(link.cleanAfter).toBeUndefined();
    expect(link.source?.startsWith("abc")).toBe(true);
    expect(link.source).not.toMatch(/[\n‮]/);
    expect(link.source?.length).toBeLessThanOrEqual(80);
  });

  it("其他协议和没见过的动作都是无法识别", () => {
    for (const other of [
      "https://x.dev/open/demo",
      "runyard://delete/demo",
      "nonsense",
      "runyard://new",
    ]) {
      expect(parseLink(other)).toMatchObject({ kind: "invalid", reason: "unknown" });
    }
  });
});
