import { listFiles, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// file-size：源码文件不超过 400 行（技术设计 §3.3、§6.7 规则 5、§9.2；根 AGENTS.md“约定”）。
// 范围：packages/、apps/、tooling/ 下的 .ts .tsx .mts .cts .css。不算：
// - 测试文件（*.test.*、*.spec.*）：一个测试文件按场景成组，拆开会让同一个场景散在两处；
//   这是对“源码文件”的解释，不是放宽，行数多的测试文件由评审负责；
// - 声明文件和 generated/ 目录里的生成物：手改不了，拆它没有意义（generated-fresh 管它们）。
// 超过的就拆：一个文件一个概念，把其中一个概念搬到自己的文件里，不调上限。

export const MAX_LINES = 400;

const SCANNED_ROOTS = ["packages/", "apps/", "tooling/"];
const SOURCE = /\.(?:ts|tsx|mts|cts|css)$/;
const EXEMPT = /\.(?:test|spec)\.(?:ts|tsx|mts|cts)$|\.d\.ts$|(?:^|\/)generated\//;

export function isSizeChecked(path: string): boolean {
  return (
    SCANNED_ROOTS.some((root) => path.startsWith(root)) && SOURCE.test(path) && !EXEMPT.test(path)
  );
}

export function countLines(text: string): number {
  if (text === "") return 0;
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

export function checkFileSize(path: string, text: string): string[] {
  const lines = countLines(text);
  if (lines <= MAX_LINES) return [];
  return [
    `${path} 有 ${lines} 行，超过 ${MAX_LINES} 行的上限。把其中一个独立的概念拆到自己的文件里（一个文件一个概念，不建 utils.ts 一类的杂物间），不要调上限；见技术设计 §6.7 规则 5 和根 AGENTS.md 的“约定”。`,
  ];
}

export const fileSize: Check = {
  name: "file-size",
  run(root) {
    return listFiles(root)
      .filter(isSizeChecked)
      .flatMap((file) => checkFileSize(file, readText(root, file)));
  },
};
