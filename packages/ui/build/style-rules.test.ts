import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 组件样式的结构性规则。完整的 style-tokens 检查随 #165 进 pnpm check，这里先守住本 PR 的组件
// 会用到的几条（技术设计 §6.7 规则 3、7 和“组件的完成标准”第 4、7 条）。
const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../src");

function files(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path, suffix) : path.endsWith(suffix) ? [path] : [];
  });
}

const cssFiles = files(srcDir, ".css");
const read = (path: string) => readFileSync(path, "utf8");

describe("组件样式规则", () => {
  it("backdrop-filter 只出现在 styles/materials.css", () => {
    const offenders = cssFiles
      .filter((file) => /backdrop-filter/.test(read(file)))
      .map((file) => relative(srcDir, file));
    expect(offenders).toEqual(["styles/materials.css"]);
  });

  it("组件的 .tsx 里没有 backdrop-filter、十六进制颜色和 rgb()", () => {
    for (const file of files(srcDir, ".tsx").filter((f) => !f.endsWith(".test.tsx"))) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, relative(srcDir, file)).not.toMatch(
        /backdrop-filter|#[0-9a-fA-F]{3,8}\b|rgba?\(/,
      );
    }
  });

  it("组件的 .module.css 不写颜色、基础级变量和左右方向的属性", () => {
    for (const file of cssFiles.filter((f) => f.endsWith(".module.css"))) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      const name = relative(srcDir, file);
      expect(css, `${name} 写了颜色`).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(css, `${name} 用了基础级变量`).not.toMatch(
        /var\(--(?:blue|gray|green|red|orange|purple|yellow|ink|night|white|amber|gold|olive|cyan|crimson|coral|magenta|sand)\b/,
      );
      expect(css, `${name} 用了左右方向`).not.toMatch(
        /(?:margin|padding|border)-(?:left|right)|\b(?:left|right)\s*:/,
      );
    }
  });

  it("按钮有看得见的键盘焦点环，并且用设计变量里的焦点环", () => {
    const css = read(join(srcDir, "primitives/Button/Button.module.css"));
    expect(css).toMatch(/\.root:focus-visible[^{]*\{[^}]*box-shadow:\s*var\(--shadow-focus-ring\)/);
  });

  it("减弱动态效果时按钮没有过渡也没有循环动画", () => {
    const css = read(join(srcDir, "primitives/Button/Button.module.css"));
    const block =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/transition:\s*none/);
    expect(block).toMatch(/animation:\s*none/);
  });

  it("降低透明度时玻璃配方关掉模糊", () => {
    const css = read(join(srcDir, "styles/materials.css"));
    const block =
      /@media \(prefers-reduced-transparency: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/backdrop-filter:\s*none/);
  });
});
