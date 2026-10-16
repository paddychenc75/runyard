// spec-touch：改了产品代码的 feat PR 必须动规格，或带 no-spec 标签（技术设计 §9.6.9）。
// 条件同时满足才报：PR 标题的 type 是 feat；改了 packages/*/src 或 apps/*/src 下的文件；
// 没有改 openspec/specs/ 下的任何文件；也没有 no-spec 标签（带标签时 PR 描述要写一句原因，靠评审看）。
// fix 不强制：修复里夹带行为变化只能靠评审发现。
//
// 用法（在仓库根目录）：
//   node tooling/ci/spec-touch.ts --base <提交> --head <提交> --title <PR 标题> --labels '["no-spec"]'
// 退出码：0 通过；1 缺规格改动；2 参数错误。

import { execFileSync } from "node:child_process";

const PRODUCT_SOURCE = /^(packages|apps)\/[^/]+\/src\//;
const SPEC_PATH = /^openspec\/specs\//;

export function isFeatTitle(title: string): boolean {
  return /^feat(\([^)]*\))?!?:/.test(title.trim());
}

export function specTouchErrors(title: string, labels: string[], files: string[]): string[] {
  if (!isFeatTitle(title)) return [];
  if (labels.includes("no-spec")) return [];
  if (!files.some((file) => PRODUCT_SOURCE.test(file))) return [];
  if (files.some((file) => SPEC_PATH.test(file))) return [];
  return [
    "这个 feat PR 改了 packages/*/src 或 apps/*/src，却没有动 openspec/specs/。行为变了：走 propose-change 补规格；行为没变：把标题的 type 改成 refactor、fix 等，或加 no-spec 标签并在描述里写一句原因。流程见 docs/guides/change-with-spec.md。",
  ];
}

function parseArgs(argv: string[]) {
  const args = { base: "", head: "", title: "", labels: "[]" };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    const key = argv[i]?.replace(/^--/, "");
    if (
      value === undefined ||
      (key !== "base" && key !== "head" && key !== "title" && key !== "labels")
    ) {
      throw new Error(`不认识的参数：${argv[i]}`);
    }
    args[key] = value;
  }
  if (args.base === "" || args.head === "") throw new Error("必须用 --base 和 --head 指定提交");
  return args;
}

function main(argv: string[]): number {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`参数错误：${(error as Error).message}`);
    return 2;
  }
  const files = execFileSync("git", ["diff", "--name-only", `${args.base}...${args.head}`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line !== "");
  const errors = specTouchErrors(args.title, JSON.parse(args.labels) as string[], files);
  for (const error of errors) console.error(error);
  return errors.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
