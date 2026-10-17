import { describe, expect, it } from "vitest";
import { splitCss } from "./css-declarations.ts";
import { checkCssFile, checkTsxFile, styleTokens } from "./style-tokens.ts";
import { makeRepo } from "./test-helpers.ts";

const BASE = new Set(["--blue-600", "--gray-100"]);
const MODULE = "packages/ui/src/primitives/Button/Button.module.css";
const css = (body: string, path = MODULE) =>
  checkCssFile(path, `.root {\n${body}\n}\n`, BASE, true).join("\n");

describe("style-tokens：CSS 值", () => {
  it("只用语义变量、0、1px 的样式通过", () => {
    expect(
      css(`  color: var(--color-text-primary);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border);
  margin: 0;
  border-radius: var(--radius-control);
  box-shadow: none;
  background: transparent;`),
    ).toBe("");
  });

  it("十六进制颜色、颜色函数、颜色关键字都报错，带行号和改法", () => {
    const out = css(`  color: #fff;\n  background: rgba(0, 0, 0, 0.4);\n  border-color: red;`);
    expect(out).toContain(`${MODULE}:2 写死了颜色 #fff`);
    expect(out).toContain("rgba(…)");
    expect(out).toContain("写死了颜色 red");
    expect(out).toContain("pnpm tokens:build");
    expect(out).toContain("§6.7 规则 3");
  });

  it("url(#id) 和字符串里的 # 不是颜色；var 的名字里的颜色词不算", () => {
    expect(
      css(`  clip-path: url(#abc);\n  content: "#fff";\n  color: var(--color-red-text);`),
    ).toBe("");
  });

  it("除 0 和 1px 外的像素值都报错", () => {
    expect(css(`  padding: 8px;`)).toContain("写死了像素值 8px");
    expect(css(`  margin: 0 0 0.5px 16px;`)).toContain("0.5px、16px");
    expect(css(`  width: calc(100% - 2px);`)).toContain("2px");
    expect(css(`  border-width: 1px;\n  top: 0px;`)).toBe("");
  });

  it("直接写数值的圆角、字号、字体、层级、阴影报错，变量放行", () => {
    for (const body of [
      `border-radius: 50%;`,
      `font-size: 1.2rem;`,
      `font-family: system-ui;`,
      `z-index: 10;`,
      `box-shadow: 0 0 var(--space-2) black;`,
    ]) {
      expect(css(`  ${body}`), body).toMatch(/直接写了数值|写死了颜色/);
    }
    expect(
      css(`  z-index: var(--z-overlay);\n  font: inherit;\n  border-radius: 0;\n  z-index: auto;`),
    ).toBe("");
  });

  it("左右方向的属性报错，逻辑属性放行", () => {
    for (const body of [
      `margin-left: var(--space-2);`,
      `padding-right: var(--space-2);`,
      `border-left: 1px solid var(--c);`,
      `left: 0;`,
      `text-align: right;`,
      `float: left;`,
      `border-top-left-radius: var(--radius-card);`,
    ]) {
      expect(css(`  ${body}`), body).toContain("左右方向");
    }
    expect(
      css(`  margin-inline-start: var(--space-2);\n  inset-inline-end: 0;\n  text-align: start;`),
    ).toBe("");
  });

  it("基础级变量报错，组件自己的局部变量放行", () => {
    expect(css(`  color: var(--blue-600);`)).toContain("基础级变量 --blue-600");
    expect(css(`  --button-bg: var(--color-fill-accent);\n  background: var(--button-bg);`)).toBe(
      "",
    );
  });

  it("自定义属性的定义里写死值也报错", () => {
    expect(css(`  --button-bg: #123456;`)).toContain("写死了颜色 #123456");
  });
});

describe("style-tokens：结构规则", () => {
  it("backdrop-filter 只许在 materials.css", () => {
    const body = ".glass { backdrop-filter: blur(var(--glass-blur)); }";
    const bad = checkCssFile(
      "packages/ui/src/primitives/Button/Button.module.css",
      body,
      BASE,
      true,
    );
    expect(bad.join("\n")).toContain("只许出现在 packages/ui/src/styles/materials.css");
    expect(checkCssFile("packages/ui/src/styles/materials.css", body, BASE, true)).toEqual([]);
    expect(checkCssFile(MODULE, ".a { -webkit-backdrop-filter: none; }", BASE, true)).toHaveLength(
      1,
    );
  });

  it("[data-platform] 只许出现在 platform/ 和三个指定组件", () => {
    const body = `:root[data-platform="darwin"] .a { margin: 0; }`;
    expect(checkCssFile(MODULE, body, BASE, true).join("\n")).toContain("[data-platform]");
    expect(
      checkCssFile("apps/desktop/src/renderer/features/library/x.module.css", body, BASE, false),
    ).toHaveLength(1);
    for (const ok of [
      "packages/ui/src/platform/platform.css",
      "packages/ui/src/primitives/TitleBar/TitleBar.module.css",
      "packages/ui/src/primitives/Kbd/Kbd.module.css",
    ]) {
      expect(checkCssFile(ok, body, BASE, true), ok).toEqual([]);
    }
  });

  it("注释里的写法不算；切分给出正确的行号", () => {
    expect(css(`  /* color: #fff; padding: 9px; */\n  color: var(--c);`)).toBe("");
    const { declarations } = splitCss("/* x */\n.a {\n  color: red;\n\n  margin: 0\n}\n");
    expect(declarations).toEqual([
      { line: 3, property: "color", value: "red" },
      { line: 5, property: "margin", value: "0" },
    ]);
  });

  it("@media 里的像素不算声明", () => {
    expect(
      checkCssFile(MODULE, "@media (min-width: 800px) { .a { margin: 0; } }", BASE, true),
    ).toEqual([]);
  });
});

describe("style-tokens：动效和滚动条（视觉规范第 5、6 节）", () => {
  it("写死的动画时长报错，变量和 0s 放行", () => {
    for (const body of [
      `transition: opacity 120ms linear;`,
      `transition: opacity var(--motion-duration-fast) linear, color 0.2s;`,
      `animation: spin 900ms linear infinite;`,
      `transition-duration: .25s;`,
      `animation-delay: 100ms;`,
    ]) {
      expect(css(`  ${body}`), body).toContain("写死了时长");
    }
    expect(
      css(
        `  transition: opacity var(--motion-duration-fast) var(--motion-easing-standard);\n  animation: none;\n  transition-duration: 0s;`,
      ),
    ).toBe("");
  });

  it("浏览器自带滚动条的样式和 overflow: auto 只许在 ScrollArea 目录", () => {
    for (const body of [`scrollbar-width: none;`, `scrollbar-color: red blue;`]) {
      expect(css(`  ${body}`), body).toContain("ScrollArea");
    }
    expect(css(`  overflow-y: auto;`)).toContain("ScrollArea");
    expect(css(`  overflow: scroll;`)).toContain("ScrollArea");
    expect(css(`  overflow: hidden;\n  overflow-x: clip;`)).toBe("");
    const inside = "packages/ui/src/primitives/ScrollArea/ScrollArea.module.css";
    expect(
      checkCssFile(inside, ".a { overflow: auto; scrollbar-width: none; }", BASE, true),
    ).toEqual([]);
    const webkit = ".a::-webkit-scrollbar { width: 0; }";
    expect(checkCssFile(MODULE, webkit, BASE, true).join("\n")).toContain("::-webkit-scrollbar");
    expect(
      checkCssFile("apps/desktop/src/renderer/editor/x.css", webkit, BASE, false),
    ).toHaveLength(1);
    expect(checkCssFile(inside, webkit, BASE, true)).toEqual([]);
  });
});

describe("style-tokens：tsx", () => {
  const tsx = (code: string) => checkTsxFile("packages/ui/src/primitives/X/X.tsx", code).join("\n");

  it("字符串里的颜色和 backdrop-filter 报错，普通字符串放行", () => {
    expect(tsx(`export const a = "#ff0000";`)).toContain("X.tsx:1 的字符串里写死了颜色");
    expect(tsx("export const a = `rgba(0,0,0,.5)`;")).toContain("写死了颜色");
    expect(tsx(`export const a = "backdrop-filter: blur(4px)";`)).toContain("backdrop-filter");
    expect(tsx(`export const a = "#root"; export const b = "&#x4e2d;";`)).toBe("");
  });

  it("style={{…}} 里的颜色、数值、像素、左右方向报错，变量和 0 放行", () => {
    const bad = tsx(
      `export const A = () => <div style={{ color: "red", width: 12, marginLeft: "var(--space-2)", fontSize: "14px" }} />;`,
    );
    expect(bad).toContain("color 写死了颜色");
    expect(bad).toContain("width 写死了数值 12");
    expect(bad).toContain("左右方向的 marginLeft");
    expect(bad).toContain("fontSize 写死了“14px”");
    expect(
      tsx(
        `export const A = () => <div style={{ color: "var(--color-text-primary)", width: 0, gap: "var(--space-2)", background: "transparent" }} />;`,
      ),
    ).toBe("");
  });

  it("[data-platform] 出现在 tsx 字符串里，同样只许在允许的地方", () => {
    const code = `export const a = '[data-platform="darwin"]';`;
    expect(tsx(code)).toContain("[data-platform]");
    expect(checkTsxFile("packages/ui/src/platform/x.tsx", code)).toEqual([]);
  });
});

describe("style-tokens：整个仓库", () => {
  const TOKENS = ":root {\n  --blue-600: #00f;\n  --color-text-primary: #111;\n}\n";

  it("基础级变量名单读自 tokens.css；范围是 ui 的 css/tsx 和 renderer 的 module.css/tsx", () => {
    const root = makeRepo({
      "packages/tokens/generated/tokens.css": TOKENS,
      "packages/ui/src/styles/base.css": "html { color: var(--blue-600); }\n",
      "packages/ui/src/primitives/A/A.tsx": 'export const a = "#abc";\n',
      "packages/ui/src/primitives/A/A.test.tsx": 'export const a = "#abc";\n',
      "apps/desktop/src/renderer/styles.css": "body { color: #666; margin: 8px; }\n",
      "apps/desktop/src/renderer/features/library/L.module.css": ".a { margin: 8px; }\n",
      "apps/desktop/src/renderer/features/library/L.tsx": "export const L = 1;\n",
    });
    const errors = styleTokens.run(root);
    expect(errors.filter((e) => e.startsWith("packages/ui/src/styles/base.css:1"))).toHaveLength(1);
    expect(errors.filter((e) => e.startsWith("packages/ui/src/primitives/A/A.tsx:1"))).toHaveLength(
      1,
    );
    expect(
      errors.filter((e) =>
        e.startsWith("apps/desktop/src/renderer/features/library/L.module.css:1"),
      ),
    ).toHaveLength(1);
    expect(errors.join("\n")).not.toContain("A.test.tsx");
    expect(errors.join("\n")).not.toContain("renderer/styles.css");
    expect(errors).toHaveLength(3);
  });

  it("packages/tokens/generated 里的原始值不查（不在范围内）", () => {
    expect(styleTokens.run(makeRepo({ "packages/tokens/generated/tokens.css": TOKENS }))).toEqual(
      [],
    );
  });
});
