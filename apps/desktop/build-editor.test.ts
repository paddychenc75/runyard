import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEditor } from "./build-editor.ts";

// 真的跑一次编辑器构建（约几秒）：产物齐全、后台线程是独立文件、样式里的字体指向本地文件、没有任何远程地址。

describe("buildEditor", () => {
  it("输出编辑器脚本、样式、字体、两个后台线程和冒烟页，且不引用网络地址", async () => {
    const out = mkdtempSync(join(tmpdir(), "ry-editor-build-"));
    await buildEditor(out);
    for (const file of [
      "editor/editor.js",
      "editor/editor.css",
      "workers/editor.worker.js",
      "workers/ts.worker.js",
      "editor-smoke.js",
      "editor-smoke.html",
    ]) {
      expect(existsSync(join(out, file)), file).toBe(true);
    }
    const fonts = readdirSync(join(out, "editor")).filter((name) => name.endsWith(".ttf"));
    expect(fonts).toHaveLength(1);
    const css = readFileSync(join(out, "editor/editor.css"), "utf8");
    expect(css).toContain(fonts[0] ?? "");
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
    expect(statSync(join(out, "workers/ts.worker.js")).size).toBeGreaterThan(1_000_000);
    const smokeHtml = readFileSync(join(out, "editor-smoke.html"), "utf8");
    const policy = (html: string) => /Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
    const index = readFileSync("src/renderer/index.html", "utf8");
    expect(policy(smokeHtml)).toBe(policy(index));
    expect(smokeHtml).toContain("editor-smoke.js");
    expect(smokeHtml).not.toContain("main.js");
  }, 60_000);
});
