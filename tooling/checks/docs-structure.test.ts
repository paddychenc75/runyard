import { describe, expect, it } from "vitest";
import { checkStructure, GUIDE_SECTIONS, PACKAGE_SECTIONS } from "./docs-structure.ts";
import { makeRepo } from "./test-helpers.ts";

const sections = (names: string[]) => names.map((name) => `## ${name}\n\n内容\n`).join("\n");
const PKG = { name: "@runyard/core" };

describe("docs-structure 检查", () => {
  it("包有 AGENTS.md 且五节齐全、手册四节齐全时通过", () => {
    const root = makeRepo({
      "packages/core/package.json": PKG,
      "packages/core/AGENTS.md": `# core\n\n${sections(PACKAGE_SECTIONS)}`,
      "docs/guides/add-x.md": `# 加 x\n\n${sections(GUIDE_SECTIONS)}`,
      "docs/guides/commands.md": "# 命令表\n",
    });
    expect(checkStructure(root)).toEqual([]);
  });

  it("没有待补清单：已有的包同样必须有 AGENTS.md", () => {
    const root = makeRepo({ "packages/protocol/package.json": { name: "@runyard/protocol" } });
    expect(checkStructure(root).join()).toContain("packages/protocol 没有 AGENTS.md");
  });

  it("包没有 AGENTS.md", () => {
    const root = makeRepo({ "packages/core/package.json": PKG });
    expect(checkStructure(root).join()).toContain("packages/core 没有 AGENTS.md");
  });

  it("包的 AGENTS.md 缺固定章节", () => {
    const root = makeRepo({
      "packages/core/package.json": PKG,
      "packages/core/AGENTS.md": `# core\n\n${sections(["用途", "测试"])}`,
    });
    expect(checkStructure(root).join()).toContain("缺固定章节");
  });

  it("手册缺章节或顺序不对", () => {
    const root = makeRepo({ "docs/guides/add-x.md": sections(["步骤", "何时用", "验证"]) });
    expect(checkStructure(root).join()).toContain("不符合手册的固定结构");
  });
});
