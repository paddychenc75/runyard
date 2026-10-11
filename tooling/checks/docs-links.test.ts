import { describe, expect, it } from "vitest";
import { docsLinks, headingSlug } from "./docs-links.ts";
import { makeRepo } from "./test-helpers.ts";

describe("docs-links 检查", () => {
  it("能点开的链接通过：相对路径、标题锚点、<a id>、站外链接、代码里的不算", () => {
    const root = makeRepo({
      "AGENTS.md":
        "[手册](docs/guide.md) [节](docs/guide.md#第一步) [锚](docs/guide.md#stable) [站外](https://example.com/x)\n`[假](nope.md)`\n",
      "docs/guide.md": '# 手册\n\n## 第一步\n\n<a id="stable"></a>\n[回根](../AGENTS.md)\n',
    });
    expect(docsLinks.run(root)).toEqual([]);
  });

  it("指向不存在的文件", () => {
    const root = makeRepo({ "docs/a.md": "见 [手册](./missing.md)\n" });
    expect(docsLinks.run(root).join()).toContain("指向的文件不存在");
  });

  it("锚点不存在", () => {
    const root = makeRepo({ "a.md": "[节](b.md#没有这一节)\n", "b.md": "# 标题\n" });
    expect(docsLinks.run(root).join()).toContain("锚点 #没有这一节");
  });

  it("指到仓库外面（比如本机归档）", () => {
    const root = makeRepo({ "docs/a.md": "[报告](../../notes/report.md)\n" });
    expect(docsLinks.run(root).join()).toContain("指到了仓库外面");
  });

  it("标题变锚点：去标点、空格变连字符", () => {
    expect(headingSlug("4.2 运行与实时结果")).toBe("42-运行与实时结果");
  });
});
