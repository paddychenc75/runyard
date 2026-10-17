import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const base = readFileSync(join(import.meta.dirname, "base.css"), "utf8");

describe("页面基础样式", () => {
  it("[#348] 界面文字默认不可选中，输入框、编辑器、终端、日志等例外放开", () => {
    expect(base).toMatch(/body \{[^}]*user-select: none/);
    const exceptions = base.slice(base.indexOf("input,"));
    for (const selector of ["textarea", "[data-selectable]", ".monaco-editor", ".xterm"]) {
      expect(exceptions).toContain(selector);
    }
    expect(exceptions).toMatch(/user-select: text/);
  });
});
