import { listFiles, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// testing-imports：@runyard/testing 只在测试里被导入（技术设计 §3.2，决策记录 0014）。
// layers 检查管 package.json 里它只能是 devDependencies；这里管源码：
// 不是 *.test.ts 的文件（也就是会被打进产品的源码）不许导入它，静态、动态、require 的写法都查。
// 包自己（packages/testing/）除外。

const SCANNED_ROOTS = ["packages/", "apps/"];
const OWN_PREFIX = "packages/testing/";
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.test\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// from "…" / import "…" / import("…") / require("…")，包括 @runyard/testing/ 下的子路径
const IMPORT_OF_TESTING =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]@runyard\/testing(?:\/[^"'`]*)?["'`]/;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function checkTestingImports(file: string, text: string): string[] {
  if (!IMPORT_OF_TESTING.test(stripComments(text))) return [];
  return [
    `${file} 在非测试源码里导入了 @runyard/testing。只有 *.test.ts 能导入测试替身：把这段逻辑改成从参数接收平台和时钟，把用到替身的部分挪进测试文件。见决策记录 0014、技术设计 §3.2。`,
  ];
}

export const testingImports: Check = {
  name: "testing-imports",
  run(root) {
    return listFiles(root)
      .filter(
        (file) =>
          SCANNED_ROOTS.some((prefix) => file.startsWith(prefix)) &&
          !file.startsWith(OWN_PREFIX) &&
          SOURCE_FILE.test(file) &&
          !TEST_FILE.test(file),
      )
      .flatMap((file) => checkTestingImports(file, readText(root, file)));
  },
};
