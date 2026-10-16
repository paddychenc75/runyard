import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeRepo } from "./test-helpers.ts";
import { checkPurityOfCode, productTerms, splitWords, uiPurity } from "./ui-purity.ts";

const read = (path: string) => readFileSync(join(import.meta.dirname, "../..", path), "utf8");
const GLOSSARY = read("docs/glossary.md");
const CONFIG = read("tooling/checks/ui-purity.json");
const terms = productTerms(GLOSSARY, JSON.parse(CONFIG));

const repo = (files: Record<string, string>) =>
  makeRepo({ "docs/glossary.md": GLOSSARY, "tooling/checks/ui-purity.json": CONFIG, ...files });

describe("ui-purity 检查", () => {
  it("名字按 camelCase、连字符、下划线拆成词", () => {
    expect(splitWords("LibraryTable")).toEqual(["library", "table"]);
    expect(splitWords("HTMLTemplateElement")).toEqual(["html", "template", "element"]);
    expect(splitWords("run-state_x2")).toEqual(["run", "state", "x2"]);
  });

  it("词表来自术语表的“代码标识符”一列，并带 runyard；通用词不在其中", () => {
    const flat = terms.map((term) => term.join(" "));
    for (const word of [
      "playground",
      "template",
      "supervisor",
      "toolchain",
      "runyard",
      "run",
      "auto clean",
    ]) {
      expect(flat, word).toContain(word);
    }
    for (const word of ["tab", "platform", "preview"]) expect(flat, word).not.toContain(word);
  });

  it("声明的名字里有产品词就报错，并指向规则和改法", () => {
    const code = `export function LibraryTable() {}\nexport const runnerList = 1;\ninterface TemplateProps { playgroundId: string }`;
    const errors = checkPurityOfCode("packages/ui/src/patterns/X.tsx", code, terms);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain("packages/ui/src/patterns/X.tsx:1");
    expect(errors[0]).toContain("“library”");
    expect(errors[0]).toContain("§6.7 规则 2");
  });

  it("别人的名字、整词不同的名字不报：只看本包声明的词", () => {
    const code = `const rect = el.getBoundingClientRect();\nconst x = document.createElement("div");\nexport const Runtime = 1;\nexport const Tab = 1; export const Platform = 2;\nimport { runtime as Rt } from "x";`;
    expect(checkPurityOfCode("packages/ui/src/a.ts", code, terms)).toEqual([]);
  });

  it("对象字面量的键和 JSX 属性名是别人的接口，不报；接口里声明的属性才是本包起的名字", () => {
    const config = `export default defineConfig({ snapshotPathTemplate: "x" });\nconst el = <X template="a" />;`;
    expect(checkPurityOfCode("packages/ui/visual/playwright.config.tsx", config, terms)).toEqual(
      [],
    );
    expect(
      checkPurityOfCode("packages/ui/src/a.ts", `interface P { template: string }`, terms),
    ).toHaveLength(1);
  });

  it("导入别名是本包起的名字，导入原名不是", () => {
    expect(
      checkPurityOfCode("packages/ui/src/a.ts", `import { a as LibraryThing } from "x";`, terms),
    ).toHaveLength(1);
    expect(
      checkPurityOfCode("packages/ui/src/a.ts", `import { createTemplate } from "x";`, terms),
    ).toEqual([]);
  });

  it("整个仓库扫描：文件名、目录名、声明名；测试文件内容和别的包不查", () => {
    const root = repo({
      "packages/ui/src/patterns/LibraryTable/LibraryTable.tsx": "export const ok = 1;\n",
      "packages/ui/src/primitives/Button/Button.tsx": "export const PlaygroundButton = 1;\n",
      "packages/ui/src/primitives/Button/Button.test.tsx": "const playground = 1;\n",
      "packages/ui/src/primitives/Tab/Tab.tsx": "export const Tab = 1;\n",
      "apps/desktop/src/renderer/x.ts": "export const playground = 1;\n",
    });
    const errors = uiPurity.run(root);
    expect(errors.filter((e) => e.includes("文件名或目录名"))).toHaveLength(1);
    expect(errors.join("\n")).toContain("Button.tsx:1");
    expect(errors.join("\n")).not.toContain("Button.test.tsx");
    expect(errors.join("\n")).not.toContain("apps/desktop/src/renderer/x.ts");
    expect(errors).toHaveLength(2);
  });

  it("没有 packages/ui 的仓库直接通过", () => {
    expect(uiPurity.run(repo({}))).toEqual([]);
  });
});
