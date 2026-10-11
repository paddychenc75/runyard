import { execFileSync } from "node:child_process";
import { listFiles, PRD_FILE, readText } from "./docs.ts";
import { prdAnchors } from "./prd-refs.ts";
import type { Check } from "./workspace.ts";

// prd-anchors-kept：改 PRD 时没有删掉还被引用着的锚点，也没有重复的锚点（技术设计 §9.5、§9.4）。
// 做法：拿“基准版本”的 PRD 和现在的比，找出被删掉（或改了名）的锚点，再在整个仓库里
// 找还有没有地方提到它。和 prd-refs 的区别：这里连代码、测试、配置也搜，并且直接指出
// “是这次改动删掉的”。
// 基准版本：当前分支与 main（先试 origin/main）的分叉点；就在 main 上时是最近一次提交。
// 这是唯一调用 git 的检查。不在 git 仓库里、或基准里还没有 PRD 时，只查重复锚点。
// CI 注意：检出代码时要带上 main 的历史（完整克隆），否则找不到分叉点，只能和最近一次提交比。

const TEXT_FILE = /\.(md|ts|tsx|mts|mjs|js|json|toml|ya?ml)$/;

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

// 基准版本里的 PRD 全文；拿不到就返回 undefined
export function basePrd(root: string): string | undefined {
  // 只在 root 自己就是仓库根时才比，免得假仓库（测试）读到外层仓库的历史
  if (git(root, ["rev-parse", "--show-prefix"])?.trim() !== "") return undefined;
  let base = "HEAD";
  for (const ref of ["origin/main", "main"]) {
    const mergeBase = git(root, ["merge-base", "HEAD", ref])?.trim();
    if (mergeBase !== undefined && mergeBase !== "") {
      base = mergeBase;
      break;
    }
  }
  return git(root, ["show", `${base}:${PRD_FILE}`]);
}

// references：除 PRD 外各文件的 {路径: 全文}
export function checkAnchorsKept(
  baseText: string | undefined,
  currentText: string,
  references: Record<string, string>,
): string[] {
  const errors: string[] = [];
  const current = prdAnchors(currentText);
  for (const anchor of new Set(current.filter((a, i) => current.indexOf(a) !== i))) {
    errors.push(
      `${PRD_FILE} 里锚点 ${anchor} 出现了不止一次。锚点不许复用：给后加的那一处起一个新名字。`,
    );
  }
  if (baseText === undefined) return errors;
  const kept = new Set(current);
  for (const anchor of prdAnchors(baseText).filter((a) => !kept.has(a))) {
    const pattern = new RegExp(`${anchor}(?![a-z0-9-])`);
    const users = Object.entries(references)
      .filter(([, text]) => pattern.test(text))
      .map(([path]) => path);
    if (users.length === 0) continue;
    errors.push(
      `${PRD_FILE} 删掉（或改名）了锚点 ${anchor}，但它还被这些文件引用着：${users.join("、")}。锚点起了名就不改、不删：把 <a id="${anchor}"></a> 加回去；确实要去掉这一节，先把引用它的地方改完。`,
    );
  }
  return errors;
}

export const prdAnchorsKept: Check = {
  name: "prd-anchors-kept",
  run(root) {
    const files = listFiles(root);
    if (!files.includes(PRD_FILE)) return []; // PRD 不在时由 prd-refs 报错
    const references: Record<string, string> = {};
    for (const file of files) {
      if (file !== PRD_FILE && TEXT_FILE.test(file) && !file.startsWith("docs/design/")) {
        references[file] = readText(root, file);
      }
    }
    return checkAnchorsKept(basePrd(root), readText(root, PRD_FILE), references);
  },
};
