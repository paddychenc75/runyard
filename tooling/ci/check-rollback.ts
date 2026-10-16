// 拦住“悄悄回滚别人刚合并的改动”（PR #87 用过期的工作副本，把 PR #84 改过的 48 个文件整个改回去，CI 仍是绿的）。
// 规则：PR 相对合并基点改了某个文件，如果改完后的内容和 main 最近 N 个提交里某一个提交“改它之前”的内容
// 完全一样（逐字节），就是把那个提交对这个文件的改动整个撤销了。标题的 type 是 revert 的 PR 不查。
// 同一个提交被撤销的文件数不到 3 个不报（见 DEFAULT_MIN_FILES）。只管整个文件被改回去；一个文件里只回退一部分查不出来，那靠评审和“改动范围”清单。
//
// 用法（在仓库根目录）：
//   node tooling/ci/check-rollback.ts --base <main 的提交> --head <PR 的提交> --title <PR 标题> [--depth 30] [--min-files 3]
// 退出码：0 通过；1 发现回滚；2 参数错误。

import { execFileSync } from "node:child_process";

export const DEFAULT_DEPTH = 30;
// 同一个提交的改动至少被撤销这么多个文件才报：过期的工作副本一次会撤销一批，
// 而有意撤销单个文件（例如拆掉先前加的临时目录配置）是正常的编辑，不该被挡住
export const DEFAULT_MIN_FILES = 3;

export interface Rollback {
  file: string;
  commit: string;
  subject: string;
}

export function isRevertTitle(title: string): boolean {
  return /^revert(\([^)]*\))?!?:/.test(title.trim());
}

function git(cwd: string | undefined, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// 文件在某个提交里的内容标识；文件不存在返回 null
function blob(cwd: string | undefined, commit: string, file: string): string | null {
  try {
    return git(cwd, ["rev-parse", "--verify", "--quiet", `${commit}:${file}`]).trim();
  } catch {
    return null;
  }
}

export function findRollbacks(
  base: string,
  head: string,
  depth = DEFAULT_DEPTH,
  cwd?: string,
): Rollback[] {
  const mergeBase = git(cwd, ["merge-base", base, head]).trim();
  // 只看已有文件被修改（M）：新建和删除不在此列，避免挡住正常的整理
  const changed = git(cwd, ["diff", "--name-only", "--diff-filter=M", "-z", mergeBase, head])
    .split("\0")
    .filter((line) => line !== "");
  const found: Rollback[] = [];
  for (const file of changed) {
    const headBlob = blob(cwd, head, file);
    if (headBlob === null) continue;
    const recent = git(cwd, [
      "log",
      "--first-parent",
      `-n${depth}`,
      "--format=%H%x09%s",
      base,
      "--",
      file,
    ])
      .split("\n")
      .filter((line) => line !== "");
    for (const line of recent) {
      const [commit = "", subject = ""] = line.split("\t");
      const before = blob(cwd, `${commit}^`, file);
      const after = blob(cwd, commit, file);
      if (before !== null && after !== null && before !== after && before === headBlob) {
        found.push({ file, commit: commit.slice(0, 7), subject });
        break;
      }
    }
  }
  return found;
}

// 按被撤销的提交分组，每组不到 minFiles 个文件的丢掉
export function describe(rollbacks: Rollback[], minFiles = DEFAULT_MIN_FILES): string[] {
  const groups = new Map<string, Rollback[]>();
  for (const r of rollbacks) groups.set(r.commit, [...(groups.get(r.commit) ?? []), r]);
  return [...groups.values()]
    .filter((group) => group.length >= minFiles)
    .map((group) => {
      const first = group[0] as Rollback;
      return (
        `${group.length} 个文件改完后的内容和 ${first.commit}（${first.subject}）改它们之前完全一样，等于把那次改动整个撤销了：` +
        `${group.map((r) => r.file).join("、")}。` +
        "如果是过期的工作副本带进来的，用 git merge origin/main 或 git rebase origin/main 逐处解决冲突，不要整个文件取一边；" +
        "如果确实要回退，把 PR 标题的 type 改成 revert。"
      );
    });
}

function main(): number {
  const argv = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (
      !["--base", "--head", "--title", "--depth", "--min-files"].includes(key ?? "") ||
      value === undefined
    ) {
      console.error(`参数错误：${key ?? ""}。用法见文件开头的说明。`);
      return 2;
    }
    values.set(key as string, value);
  }
  const base = values.get("--base");
  const head = values.get("--head");
  const title = values.get("--title");
  const depth = Number(values.get("--depth") ?? DEFAULT_DEPTH);
  const minFiles = Number(values.get("--min-files") ?? DEFAULT_MIN_FILES);
  if (
    base === undefined ||
    head === undefined ||
    title === undefined ||
    !(depth > 0) ||
    !(minFiles > 0)
  ) {
    console.error("参数错误：--base、--head、--title 都要给，--depth 和 --min-files 要是正整数。");
    return 2;
  }
  if (isRevertTitle(title)) {
    console.log("通过  标题是 revert，不查回滚");
    return 0;
  }
  const errors = describe(findRollbacks(base, head, depth), minFiles);
  for (const error of errors) console.error(`失败  ${error}`);
  if (errors.length === 0) console.log("通过  没有整个文件被改回去");
  return errors.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
