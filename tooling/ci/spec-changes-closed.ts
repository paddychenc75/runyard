// spec-changes-closed：PR 准备合并时，openspec/changes/ 下不能还有没合并的改动文件夹（技术设计 §9.6.9）。
// 进行中的改动只存在于开发分支；开 PR 之前要用 archive-change 把增量合并进 openspec/specs/。
// archive/ 是本机归档，被 .gitignore 忽略，不算。草稿 PR 不跑（工作流里用 draft 条件跳过）。
//
// 用法（在仓库根目录）：node tooling/ci/spec-changes-closed.ts [--root <目录>]
// 退出码：0 通过；1 还有没合并的改动；2 参数错误。

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function openChanges(root: string): string[] {
  const dir = join(root, "openspec", "changes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .map((entry) => entry.name)
    .sort();
}

export function changesClosedErrors(names: string[]): string[] {
  return names.map(
    (name) =>
      `openspec/changes/${name}/ 还没有合并进主规格。用 archive-change 合并（pnpm spec archive ${name} --yes）并删掉这个文件夹，再请人合并 PR；流程见 docs/guides/change-with-spec.md。`,
  );
}

function main(argv: string[]): number {
  let root = join(import.meta.dirname, "..", "..");
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (argv[i] !== "--root" || value === undefined) {
      console.error(`参数错误：${argv[i]}`);
      return 2;
    }
    root = value;
  }
  const errors = changesClosedErrors(openChanges(root));
  for (const error of errors) console.error(error);
  return errors.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
