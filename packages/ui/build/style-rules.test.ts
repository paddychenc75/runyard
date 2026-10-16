import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 组件样式的行为性规则：焦点环、减弱动态效果、降低透明度（技术设计 §6.7“组件的完成标准”第 4、7 条）。
// 写死的颜色、像素、左右方向、backdrop-filter 的位置由 pnpm check 里的 style-tokens 检查（#165）负责，这里不重复。
const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../src");

const read = (path: string) => readFileSync(path, "utf8");

describe("组件样式规则", () => {
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
