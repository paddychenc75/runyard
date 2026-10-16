import { describe, expect, it } from "vitest";
import { isProductSource } from "./source-files.ts";
import { makeRepo } from "./test-helpers.ts";
import { checkUiStrings, uiStrings } from "./ui-strings.ts";

const check = (path: string, code: string) => checkUiStrings(path, code).join("\n");
const SRC = "packages/core/src/a.ts";
// 模板字符串的占位符拆开写，免得 Biome 把测试数据当成写错的模板
const N = ["$", "{n}"].join("");

describe("ui-strings 检查", () => {
  it("注释、标识符、不含汉字的字符串都放行（注释里的汉字是仓库规定）", () => {
    expect(
      checkUiStrings(
        SRC,
        `// 这是中文注释
/* 块注释，含 "引号" 和 // 斜杠 */
export const a = "hello"; // 行尾注释：中文
export const b = \`x\${1}\`;
`,
      ),
    ).toEqual([]);
  });

  it("字符串、模板字符串（含插值的各段）里有汉字", () => {
    expect(check(SRC, `export const a = "还没有项目";`)).toContain(`${SRC}:1 的字符串里有汉字`);
    expect(check(SRC, `export const a = \`共 ${N} 个\`;`)).toContain(":1 的字符串里有汉字");
    expect(check(SRC, `const a = \`${N}\`;\nconst b = 'ok' + \`前${N}后\`;`)).toContain(":2 ");
    expect(check(SRC, `const a = "，";`)).toContain("有汉字");
  });

  it("JSX 子文字里有汉字，属性里的字符串也查", () => {
    const tsx = `export const A = () => (\n  <p title="提示">\n    还没有项目\n  </p>\n);`;
    const errors = checkUiStrings("apps/desktop/src/renderer/a.tsx", tsx);
    expect(errors).toHaveLength(2);
  });

  it("JSX 里写死的汉字：标签之间、表达式里的字面量、模板、组件属性、原生属性都红", () => {
    const path = "packages/ui/src/a.tsx";
    const jsx = (inner: string) => `export const A = () => (\n  <div>\n    ${inner}\n  </div>\n);`;
    const t = ["$", "{n}"].join("");
    const cases = [
      "<p>还没有项目</p>",
      '<p>{"还没有项目"}</p>',
      `<p>{\`共 ${t} 个\`}</p>`,
      '<p>{ok ? "是" : t("x")}</p>',
      '<p>{name || "默认"}</p>',
      '<Button label="保存" />',
      '<input placeholder="搜索" />',
      '<button aria-label={"关闭"} type="button" />',
    ];
    for (const inner of cases) {
      expect(checkUiStrings(path, jsx(inner)).length, inner).toBeGreaterThan(0);
    }
  });

  it("JSX 里走 t()、变量、不含汉字的文字放行；字符引用拼出的汉字照样红", () => {
    const path = "apps/desktop/src/renderer/a.tsx";
    const good = `export const A = () => (<div><p>{t("library.title")}</p><span>{name}</span><i>·</i><code>ls</code></div>);`;
    expect(checkUiStrings(path, good)).toEqual([]);
    expect(
      checkUiStrings(path, `export const A = () => <p>&#x4e2d;&#25991;</p>;`).length,
    ).toBeGreaterThan(0);
  });

  it("*.test.tsx 不在范围里（测试标题和断言可以是中文）", () => {
    expect(isProductSource("packages/ui/src/a.tsx")).toBe(true);
    expect(isProductSource("packages/ui/src/a.test.tsx")).toBe(false);
  });

  it("注释里的引号和字符串里的 // 不会骗过扫描", () => {
    expect(check(SRC, `// "还没有项目"\nconst a = 1;`)).toBe("");
    expect(check(SRC, `const url = "http://x/中文";`)).toContain("有汉字");
  });

  it("i18n-allow 放行同一行或上一行，理由必填", () => {
    expect(check(SRC, `// i18n-allow: 开发者诊断，不显示给用户\nconst a = "错误";`)).toBe("");
    expect(check(SRC, `const a = "错误"; // i18n-allow: 开发者诊断`)).toBe("");
    expect(check(SRC, `// i18n-allow:\nconst a = "错误";`)).toContain("没有写理由");
    expect(check(SRC, `// i18n-allow: 理由\n\nconst a = "错误";`)).toContain("有汉字");
  });

  it("协议里的 .describe(…) 和 summary 是文档字符串，别的包不认", () => {
    const code = `export const a = z.string().describe("说明");\nexport const m = { summary: "读日志" };`;
    expect(check("packages/protocol/src/x.ts", code)).toBe("");
    expect(check("packages/core/src/x.ts", code)).toContain("有汉字");
    expect(check("packages/protocol/src/x.ts", `const msg = "给用户看";`)).toContain("有汉字");
  });

  it("process.stdout.write 不归这里管，由 ui-layers 接管（技术设计 §6.8）", () => {
    expect(check("packages/cli/src/commands/run.ts", `process.stdout.write("done\\n");`)).toBe("");
  });

  it("哪些文件算产品源码：测试、契约、测试辅助、testing 包都不算", () => {
    for (const path of [
      "packages/core/src/a.test.ts",
      "packages/platform/src/contract/x.ts",
      "packages/platform/src/test-support/x.ts",
      "packages/platform/src/contract/fixtures/x.ts",
      "packages/testing/src/fake-clock.ts",
      "tooling/checks/x.ts",
      "packages/core/src/index.d.ts",
    ]) {
      expect(isProductSource(path), path).toBe(false);
    }
    expect(isProductSource("packages/core/src/a.ts")).toBe(true);
    expect(isProductSource("apps/desktop/src/renderer/a.tsx")).toBe(true);
  });

  it("整个仓库扫描：只报产品源码，测试里的中文标题不报", () => {
    const root = makeRepo({
      "packages/core/src/a.ts": `export const a = "还没有项目";\n`,
      "packages/core/src/a.test.ts": `it("[X-01] 中文标题", () => {});\n`,
    });
    const errors = uiStrings.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/core/src/a.ts:1");
  });
});
