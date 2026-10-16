import { describe, expect, it } from "vitest";
import { buildChangeReport } from "./change-report.ts";

describe("界面变更对照页", () => {
  it("每个变了的组件一行：左改动前、中差异、右改动后，标题是组件名加中文的主题和语言", () => {
    const html = buildChangeReport([
      {
        component: "Button",
        combination: "深色、中文",
        before: "data:image/png;base64,AAA",
        diff: "data:image/png;base64,BBB",
        after: "data:image/png;base64,CCC",
      },
    ]);
    expect(html).toContain("<h2>Button（深色、中文）</h2>");
    expect(html.indexOf("AAA")).toBeLessThan(html.indexOf("BBB"));
    expect(html.indexOf("BBB")).toBeLessThan(html.indexOf("CCC"));
    expect(html).toContain("update-ui-baseline");
  });

  it("没有基准图的新组件在“改动前”一栏写“没有”；非图片的失败直接给出原文，且转义", () => {
    const html = buildChangeReport([
      { component: "Icon", combination: "浅色、英文", after: "data:image/png;base64,ZZZ" },
      { component: "Tag", combination: "浅色、伪语言", problem: "<script>x</script> 有溢出" },
    ]);
    expect(html).toContain('<p class="none">没有</p>');
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&#60;script&#62;x");
  });
});
