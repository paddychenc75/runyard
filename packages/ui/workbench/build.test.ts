// @vitest-environment node
// esbuild 在 jsdom 下会因为 TextEncoder 的实现不同而拒绝工作，构建测试用 Node 环境
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkbench } from "./build.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); // delete-allow: 测试自己建的临时目录
});

describe("工作台构建", () => {
  it("能打成静态页：index.html、main.js、main.css，样式里有设计变量和玻璃配方", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "runyard-workbench-test-"));
    dirs.push(outDir);
    await buildWorkbench(outDir);
    const html = readFileSync(join(outDir, "index.html"), "utf8");
    const css = readFileSync(join(outDir, "main.css"), "utf8");
    const js = readFileSync(join(outDir, "main.js"), "utf8");
    expect(html).toContain('<div id="root">');
    // 设计变量表和玻璃配方都进了样式；备选 CSS Modules 的类名带散列，不影响这里的断言
    expect(css).toContain("--color-text-primary");
    expect(css).toContain("backdrop-filter");
    expect(js).toContain("data-glass-material");
  });
});
