import { listFiles, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// skips：跳过的测试必须带 issue 编号（技术设计 §9.4）。
// 查 packages/、apps/、tooling/ 下的测试文件：出现 .skip / .todo / .fixme / .skipIf，
// 或 xit / xdescribe / xtest 时，同一行或上一行要有 #123 这样的 issue 编号。
// 没有编号的跳过会被忘掉，测试就这样悄悄少了一条。

const TEST_FILE = /^(packages|apps|tooling)\/.*\.(test|spec)\.(ts|tsx|mts)$/;
const SKIP = /\b(?:it|test|describe)\.(?:skip|todo|fixme|skipIf)\b|\bx(?:it|describe|test)\s*\(/;
const ISSUE = /#\d+/;

export function checkSkips(file: string, text: string): string[] {
  const errors: string[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (!SKIP.test(line)) return;
    if (ISSUE.test(line) || ISSUE.test(lines[index - 1] ?? "")) return;
    errors.push(
      `${file}:${index + 1} 跳过了测试，但没有写 issue 编号。把测试修好并去掉跳过；确实要暂时跳过，先开一个 issue，再在这一行或上一行的注释里写上编号（如 // 见 #123）。`,
    );
  });
  return errors;
}

export const skips: Check = {
  name: "skips",
  run(root) {
    return listFiles(root)
      .filter((file) => TEST_FILE.test(file))
      .flatMap((file) => checkSkips(file, readText(root, file)));
  },
};
