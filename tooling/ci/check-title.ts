// 提交信息和 PR 标题的格式检查（技术设计 §8.4）。
// 格式：type(scope): 中文主题。只查三件事（设计规定不加别的规则，尤其不查英文大小写）：
//   1. type 在允许的列表里；
//   2. scope 在允许的列表里，或者省略；
//   3. 冒号后的主题不为空，整条标题不超过 72 个字符（按字符数算，一个汉字算一个）。
//
// 用法（在仓库根目录）：
//   node tooling/ci/check-title.ts --title "feat(core): 增加运行状态机"
//   node tooling/ci/check-title.ts --range <起点>..<终点>     # 检查区间内每个提交的第一行
// 两个参数可以一起用。退出码：0 通过；1 有不合格的；2 参数错误。

import { execFileSync } from "node:child_process";

export const TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

// 允许的 scope。技术设计 §8.4 只说“在允许的列表里”，没有列出具体名字；
// 这里取自 §3.1 的目录（包名、应用名）加上几个跨目录的领域词。新增包时在这里加一项（待负责人确认）。
export const SCOPES = [
  "repo",
  "deps",
  "ci",
  "docs",
  "security",
  "release",
  "spec",
  "tooling",
  "desktop",
  "site",
  "protocol",
  "platform",
  "core",
  "supervisor",
  "client",
  "cli",
  "tokens",
  "ui",
  "i18n",
  "testing",
  "templates",
] as const;

export const MAX_LENGTH = 72;

// type、可选的 (scope)、可选的 !、冒号加一个空格、主题
const PATTERN = /^([a-z]+)(?:\(([a-z0-9-]+)\))?(!)?: (.*)$/u;

// 返回错误列表；空数组表示合格。
export function checkTitle(title: string): string[] {
  const shown = JSON.stringify(title);
  const match = PATTERN.exec(title);
  if (match === null) {
    return [
      `${shown} 不符合“type(scope): 主题”的格式（type 用小写英文，冒号后要有一个空格）。例：feat(core): 增加运行状态机`,
    ];
  }
  const [, type, scope, , subject] = match;
  const errors: string[] = [];
  if (!(TYPES as readonly string[]).includes(type as string)) {
    errors.push(`${shown} 的 type“${type}”不在允许的列表里：${TYPES.join("、")}`);
  }
  if (scope !== undefined && !(SCOPES as readonly string[]).includes(scope)) {
    errors.push(
      `${shown} 的 scope“${scope}”不在允许的列表里：${SCOPES.join("、")}（也可以省略 scope）`,
    );
  }
  if ((subject ?? "").trim() === "") {
    errors.push(`${shown} 冒号后面的主题是空的`);
  }
  const length = [...title].length;
  if (length > MAX_LENGTH) {
    errors.push(`${shown} 有 ${length} 个字符，超过上限 ${MAX_LENGTH}（一个汉字算一个字符）`);
  }
  return errors;
}

// 区间检查要跳过的提交：合并提交（git log --no-merges 已经排除）和自动修正用的 fixup!/squash!，
// 因为合并方式是 squash，进入 main 的信息来自 PR 标题。
export function shouldSkipCommit(subject: string): boolean {
  return /^(fixup|squash)! /.test(subject);
}

function main(): number {
  const argv = process.argv.slice(2);
  const titles: string[] = [];
  let range = "";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if ((arg === "--title" || arg === "--range") && value !== undefined) {
      if (arg === "--title") titles.push(value);
      else range = value;
      i++;
    } else {
      console.error(`参数错误：${arg ?? ""}。用法见文件开头的说明。`);
      return 2;
    }
  }
  if (titles.length === 0 && range === "") {
    console.error("参数错误：至少给 --title 或 --range 之一。");
    return 2;
  }

  const checked: string[] = [...titles];
  if (range !== "") {
    const out = execFileSync("git", ["log", "--no-merges", "--format=%s", range], {
      encoding: "utf8",
    });
    for (const line of out.split("\n")) {
      if (line.trim() !== "" && !shouldSkipCommit(line)) checked.push(line);
    }
  }
  let failed = false;
  for (const title of checked) {
    const errors = checkTitle(title);
    if (errors.length === 0) console.log(`通过  ${title}`);
    else {
      failed = true;
      for (const error of errors) console.error(`失败  ${error}`);
    }
  }
  if (failed) {
    console.error("格式说明见 CONTRIBUTING.md 的“提交信息和 PR 标题”一节。");
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(main());
