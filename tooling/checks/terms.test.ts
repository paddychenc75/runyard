import { describe, expect, it } from "vitest";
import { parseGlossary, terms } from "./terms.ts";
import { makeRepo } from "./test-helpers.ts";

// 用编出来的词做测试，免得这个文件自己被真实的 terms 检查拦住
const GLOSSARY = `# 术语表

| 中文术语 | 代码标识符 | 界面英文 | 禁用（中文） | 禁用（英文） | 出处 |
| --- | --- | --- | --- | --- | --- |
| 项目 | \`playground\` | playground | 沙盒工程、演示件 | sandboxy、\`demobox\` | PRD |
| 模板 | \`template\` | — | — | — | PRD |
`;

describe("terms 检查", () => {
  it("读出术语表的禁用词", () => {
    const { terms: rows, errors } = parseGlossary(GLOSSARY);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      zh: "项目",
      id: "playground",
      bannedZh: ["沙盒工程", "演示件"],
      bannedEn: ["sandboxy", "demobox"],
    });
    expect(rows[1]?.bannedZh).toEqual([]);
  });

  it("没有禁用词时通过；术语表自己和产品文档不查", () => {
    const root = makeRepo({
      "docs/glossary.md": GLOSSARY,
      "docs/product/02-prd.md": "以前叫沙盒工程。\n",
      "AGENTS.md": "新建一个项目。\n",
      "packages/core/src/playground.ts": "export const playgroundId = 1; // sandboxyness 不算\n",
    });
    expect(terms.run(root)).toEqual([]);
  });

  it("说明文件里出现中文禁用词", () => {
    const root = makeRepo({
      "docs/glossary.md": GLOSSARY,
      "docs/guides/x.md": "\n新建一个演示件。\n",
    });
    const errors = terms.run(root).join();
    expect(errors).toContain("docs/guides/x.md:2 用了禁用的词“演示件”");
    expect(errors).toContain("统一的说法是“项目”");
  });

  it("产品代码的标识符里出现英文禁用词（camelCase 拆开后匹配）", () => {
    const root = makeRepo({
      "docs/glossary.md": GLOSSARY,
      "packages/core/src/x.ts": "export const openDemoboxDir = 1;\n",
      "tooling/x.ts": "const demobox = 1; // tooling 不查英文\n",
    });
    const errors = terms.run(root);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("packages/core/src/x.ts:1 用了禁用的词“demobox”");
  });

  it("术语表缺列或不在", () => {
    expect(terms.run(makeRepo({ "docs/glossary.md": "# 空\n" })).join()).toContain("表头缺列");
    expect(terms.run(makeRepo({ "AGENTS.md": "x\n" })).join()).toContain("找不到");
  });
});
