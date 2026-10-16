import { describe, expect, it } from "vitest";
import { checkFileSize, countLines, fileSize, isSizeChecked, MAX_LINES } from "./file-size.ts";
import { makeRepo } from "./test-helpers.ts";

const lines = (count: number) => `${"x\n".repeat(count)}`;

describe("file-size 检查", () => {
  it("400 行放行，401 行报错并说明怎么拆", () => {
    expect(checkFileSize("packages/core/src/a.ts", lines(MAX_LINES))).toEqual([]);
    const errors = checkFileSize("packages/core/src/a.ts", lines(MAX_LINES + 1));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/core/src/a.ts 有 401 行");
    expect(errors[0]).toContain("拆到自己的文件");
  });

  it("行数按换行数算，末尾的换行不多算一行", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a")).toBe(1);
    expect(countLines("a\n")).toBe(1);
    expect(countLines("a\n\nb\n")).toBe(3);
  });

  it("测试文件、声明文件、generated/、模板和文档不算", () => {
    for (const path of [
      "packages/core/src/a.test.ts",
      "packages/ui/src/Button/Button.test.tsx",
      "packages/core/src/a.d.ts",
      "packages/tokens/generated/tokens.css",
      "templates/builtin/go/files/main.go",
      "docs/guides/commands.md",
    ]) {
      expect(isSizeChecked(path), path).toBe(false);
    }
    for (const path of [
      "packages/core/src/a.ts",
      "apps/desktop/src/renderer/x.tsx",
      "tooling/checks/a.ts",
      "packages/ui/src/primitives/Button/Button.module.css",
    ]) {
      expect(isSizeChecked(path), path).toBe(true);
    }
  });

  it("整个仓库扫描：只报超长的源码文件", () => {
    const root = makeRepo({
      "packages/core/src/long.ts": lines(450),
      "packages/core/src/ok.ts": lines(10),
      "packages/core/src/long.test.ts": lines(900),
    });
    const errors = fileSize.run(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packages/core/src/long.ts");
  });
});
