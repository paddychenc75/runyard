import { describe, expect, it } from "vitest";
import { absPath, joinPath, posixRelPath } from "./path-types.ts";
import { isPlatformError } from "./platform-error.ts";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "not-a-platform-error";
  }
  return undefined;
}

describe("absPath", () => {
  it("绝对路径通过，相对路径被拒绝", () => {
    expect(absPath(process.cwd())).toBe(process.cwd());
    expect(codeOf(() => absPath("relative/dir"))).toBe("INTERNAL");
    expect(codeOf(() => absPath(""))).toBe("INTERNAL");
  });
});

describe("posixRelPath", () => {
  it("用 / 分隔的相对路径通过", () => {
    expect(posixRelPath("node_modules")).toBe("node_modules");
    expect(posixRelPath("src/app/main.ts")).toBe("src/app/main.ts");
  });

  it.each([
    ["空串", ""],
    ["开头的 /", "/etc"],
    ["反斜杠", "src\\main.ts"],
    ["盘符", "C:/x"],
    ["上一级", "../x"],
    ["中间的上一级", "a/../b"],
    ["当前目录段", "./a"],
    ["空段", "a//b"],
    ["结尾的 /", "a/"],
  ])("拒绝：%s", (_title, value) => {
    expect(codeOf(() => posixRelPath(value))).toBe("INTERNAL");
  });
});

describe("joinPath", () => {
  it("把 / 分隔的相对路径接到绝对路径后面", () => {
    const base = absPath(process.cwd());
    const joined = joinPath(base, posixRelPath("a/b"), posixRelPath("c"));
    expect(joined.endsWith("c")).toBe(true);
    expect(joined.startsWith(base)).toBe(true);
    expect(joined.split(/[\\/]/).slice(-3)).toEqual(["a", "b", "c"]);
  });
});
