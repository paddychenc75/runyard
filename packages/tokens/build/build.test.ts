import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokens, DOC_BEGIN, DOC_END, replaceDocBlock } from "./build.ts";
import { loadTokens } from "./model.ts";

const packageDir = join(import.meta.dirname, "..");
const out = buildTokens(packageDir);
const lines = (text: string) => text.split("\n");

describe("tokens.css", () => {
  it("颜色在一个变量里写两个值：light-dark()，基础级用 var() 引用", () => {
    expect(out.css).toContain("--color-text-primary: light-dark(var(--ink-900), var(--gray-50));");
  });

  it("根上声明跟随系统，data-theme 可以强制浅色或深色", () => {
    expect(out.css).toContain("color-scheme: light dark;");
    expect(out.css).toContain(':root[data-theme="light"] {\n  color-scheme: light;');
    expect(out.css).toContain(':root[data-theme="dark"] {\n  color-scheme: dark;');
  });

  it("阴影是整段值，light-dark() 装不下，改用主题选择器：浅色在根上，深色在两处", () => {
    expect(out.css).toMatch(
      /:root \{[^}]*--shadow-floating:\s+0 1px 2px rgba\(15, 23, 42, 0\.05\)/,
    );
    expect(out.css).toMatch(
      /:root\[data-theme="dark"\] \{[^}]*--shadow-floating:\s+0 1px 2px rgba\(0, 0, 0, 0\.3\)/,
    );
    expect(out.css).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{[^}]*--shadow-floating:\s+0 1px 2px rgba\(0, 0, 0, 0\.3\)/,
    );
  });

  it("“降低透明度”下四种玻璃背景换成不透明底色", () => {
    const block = out.css.slice(out.css.indexOf("@media (prefers-reduced-transparency"));
    for (const name of ["toolbar", "sidebar", "filetree", "dialog"]) {
      expect(block).toMatch(
        new RegExp(`--glass-${name}-bg: light-dark\\(#[0-9a-f]{6}, #[0-9a-f]{6}\\)`),
      );
    }
  });

  it("每个 var() 引用都指向已定义的变量", () => {
    const defined = new Set([...out.css.matchAll(/^\s*--([a-z0-9-]+):/gm)].map((m) => m[1]));
    const used = [...out.css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(50);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("没有哪个变量写成了范围值", () => {
    expect(out.css).not.toMatch(/\d to \d|\d 到 \d/);
  });
});

describe("tokens.ts", () => {
  it("只含语义级变量，基础级不出现", () => {
    const source = loadTokens(packageDir);
    const quoted = lines(out.ts).filter((line) => /^\s+"[a-z0-9-]+":/.test(line));
    for (const base of Object.keys(source.base)) {
      expect(quoted.some((line) => line.trim().startsWith(`"${base}":`))).toBe(false);
    }
  });

  it("导出窗口底色，主进程建窗口时用", () => {
    expect(out.ts).toContain("export const windowBackground");
    expect(out.ts).toContain('library: themes.dark["color-bg-window"]');
  });
});

describe("editor-themes.ts", () => {
  it("三种编辑器的浅色和深色都有，色值是真实写法，没有 CSS 变量也没有 rgba()", () => {
    for (const name of ["monacoThemes", "shikiThemes", "xtermThemes"]) {
      expect(out.editor).toContain(`export const ${name} = {`);
    }
    expect(out.editor).not.toContain("var(");
    expect(out.editor).not.toContain("rgba(");
    expect(out.editor).toContain('"editor.lineHighlightBackground": "#0071E312"');
  });

  it("Monaco 的规则颜色不带 #，深色用 vs-dark", () => {
    expect(out.editor).toContain('base: "vs-dark"');
    expect(out.editor).toMatch(/token: "keyword", foreground: "[0-9A-F]{6}"/);
  });
});

describe("tokens.md 的生成段", () => {
  it("每个变量一行，来自 tokens.json 的说明和值", () => {
    expect(out.docTables).toContain("| Primary (`--color-text-primary`) | #1D1D1F | #F5F5F7 |");
    expect(out.docTables).toContain("| `--size-control-md` | 32px | Secondary button height |");
  });

  it("只替换两个标记之间的内容，前后文字保持", () => {
    const text = `前文\n${DOC_BEGIN}\n旧内容\n${DOC_END}\n后文\n`;
    const next = replaceDocBlock(text, "新表格");
    expect(next).toContain("前文");
    expect(next).toContain("后文");
    expect(next).toContain("新表格");
    expect(next).not.toContain("旧内容");
  });

  it("找不到标记就返回 undefined", () => {
    expect(replaceDocBlock("没有标记", "x")).toBeUndefined();
  });
});

describe("可重复", () => {
  it("连续生成两次，四份内容完全一致", () => {
    expect(buildTokens(packageDir)).toEqual(out);
  });

  it("仓库里提交的生成物和现在生成的一致", () => {
    const read = (path: string) => readFileSync(join(packageDir, path), "utf8");
    expect(read("generated/tokens.css")).toBe(out.css);
    expect(read("generated/tokens.ts")).toBe(out.ts);
    expect(read("generated/editor-themes.ts")).toBe(out.editor);
  });
});
