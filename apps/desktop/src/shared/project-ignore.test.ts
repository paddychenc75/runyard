import { describe, expect, it } from "vitest";
import { isIgnoredProjectPath } from "./project-ignore.ts";

describe("isIgnoredProjectPath", () => {
  it("[DESKTOP-EDITOR-71] 内部文件夹、依赖目录和构建产物里的文件都被忽略", () => {
    for (const path of [
      ".runyard/run.json",
      ".git/HEAD",
      "node_modules/react/index.js",
      "packages/a/node_modules/x/index.js",
      ".venv/bin/python",
      "src/__pycache__/a.pyc",
      "dist/index.html",
      "build/out.js",
      ".next/cache/x",
    ]) {
      expect(isIgnoredProjectPath(path), path).toBe(true);
    }
  });

  it("[DESKTOP-EDITOR-71] 普通源码不被忽略，嵌套的 build 文件夹不算构建产物", () => {
    for (const path of ["src/App.tsx", "index.html", "src/build/steps.ts", "docs/dist-notes.md"]) {
      expect(isIgnoredProjectPath(path), path).toBe(false);
    }
  });
});
