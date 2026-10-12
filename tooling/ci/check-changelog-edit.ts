// 更新日志只能由 release-please 的发版 PR 修改（决策记录 0015）。
// 手改 CHANGELOG.md 或 .release-please-manifest.json 会在下一次发版 PR 重写时丢失，或让版本号对不上，
// 所以 CI 在每个 PR 上核对：改动了这两个文件的 PR 必须是发版 PR。
//
// 用法（在仓库根目录）：
//   node tooling/ci/check-changelog-edit.ts --range <基准>...<头> --head-ref <分支名> --author <PR 作者>
// 退出码：0 通过；1 有不该有的改动；2 参数错误。

import { execFileSync } from "node:child_process";

// 只有 release-please 能写的文件
export const GENERATED_FILES = ["CHANGELOG.md", ".release-please-manifest.json"] as const;

// release-please 开的分支名都以这个开头，它用仓库默认的 GITHUB_TOKEN 开 PR，作者显示为这个机器人
export const RELEASE_BRANCH_PREFIX = "release-please--branches--";
export const RELEASE_PR_AUTHOR = "github-actions[bot]";

export function isReleasePullRequest(headRef: string, author: string): boolean {
  return headRef.startsWith(RELEASE_BRANCH_PREFIX) && author === RELEASE_PR_AUTHOR;
}

// 返回错误列表；空数组表示通过。touched 是“基准里已经存在、这个 PR 改了或删了”的受保护文件
export function checkChangelogEdit(touched: string[], headRef: string, author: string): string[] {
  if (touched.length === 0 || isReleasePullRequest(headRef, author)) return [];
  return [
    `这个 PR 改动了 ${touched.join("、")}，但它不是 release-please 的发版 PR。这两个文件只由发版 PR 写：把这些改动从本 PR 里撤掉。要补一个版本的白话说明，写 docs/releases/<版本>.md；要改章节或排列，改 release-please-config.json。详见 CONTRIBUTING.md 的“更新日志和发版”。`,
  ];
}

function main(): number {
  const argv = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!["--range", "--head-ref", "--author"].includes(key ?? "") || value === undefined) {
      console.error(`参数错误：${key ?? ""}。用法见文件开头的说明。`);
      return 2;
    }
    values.set(key as string, value);
  }
  const range = values.get("--range");
  const headRef = values.get("--head-ref");
  const author = values.get("--author");
  if (range === undefined || headRef === undefined || author === undefined) {
    console.error("参数错误：--range、--head-ref、--author 都要给。");
    return 2;
  }
  // 只看基准里已经存在的文件被改（M）、删（D）、改名（R）、换类型（T）；新建（A）不算，
  // 这样第一次把这两个文件加进仓库的 PR 不会被自己的检查拦住
  const out = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=MDRT", range, "--", ...GENERATED_FILES],
    { encoding: "utf8" },
  );
  const touched = out.split("\n").filter((line) => line.trim() !== "");
  const errors = checkChangelogEdit(touched, headRef, author);
  for (const error of errors) console.error(`失败  ${error}`);
  if (errors.length === 0) console.log("通过  没有手改更新日志");
  return errors.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
