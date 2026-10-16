import { describe, expect, it } from "vitest";
import { ignoredDirectories, isWatched, matchesGlob } from "./watch-glob.ts";

describe("watch 的路径匹配", () => {
  it("`**/*.py` 匹配任意层的 .py，不匹配别的扩展名", () => {
    expect(matchesGlob("**/*.py", "main.py")).toBe(true);
    expect(matchesGlob("**/*.py", "pkg/sub/util.py")).toBe(true);
    expect(matchesGlob("**/*.py", "notes.txt")).toBe(false);
    expect(matchesGlob("**/*.py", "main.pyc")).toBe(false);
  });

  it("`*` 不跨目录；`?` 是一个字符；点号按字面", () => {
    expect(matchesGlob("src/*.ts", "src/a.ts")).toBe(true);
    expect(matchesGlob("src/*.ts", "src/deep/a.ts")).toBe(false);
    expect(matchesGlob("a?.ts", "ab.ts")).toBe(true);
    expect(matchesGlob("a.ts", "axts")).toBe(false);
  });

  it("`dir/**` 匹配目录里的一切，也匹配目录本身，但从项目文件夹起算", () => {
    expect(matchesGlob("__pycache__/**", "__pycache__")).toBe(true);
    expect(matchesGlob("__pycache__/**", "__pycache__/x.pyc")).toBe(true);
    expect(matchesGlob("__pycache__/**", "__pycache__/a/b.pyc")).toBe(true);
    expect(matchesGlob("__pycache__/**", "pkg/__pycache__/x.pyc")).toBe(false);
    expect(matchesGlob("__pycache__/**", "__pycache__x")).toBe(false);
  });

  it("忽略优先；有 paths 时只有匹配的才触发，没有 paths 时除忽略外都触发", () => {
    const rule = { paths: ["**/*.py"], ignore: [".venv/**"] };
    expect(isWatched("main.py", rule)).toBe(true);
    expect(isWatched(".venv/lib/x.py", rule)).toBe(false);
    expect(isWatched("data.json", rule)).toBe(false);
    expect(isWatched("data.json", { ignore: [".venv/**"] })).toBe(true);
  });

  it("整棵目录都忽略的写法取出目录名交给平台层", () => {
    expect(ignoredDirectories([".venv/**", "**/*.log", "a/*/b/**", "node_modules/**"])).toEqual([
      ".venv",
      "node_modules",
    ]);
    expect(ignoredDirectories(undefined)).toEqual([]);
  });
});
