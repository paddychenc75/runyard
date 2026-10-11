import { listFiles, PRD_FILE, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// prd-refs：文档里引用的 PRD 锚点真的存在（技术设计 §9.5、§9.4）。
// 引用的写法是 “PRD #prd-run-ownership”，或链接里的 02-prd.md#prd-run-ownership。
// 范围：仓库里全部 Markdown（PRD 自己除外），包括说明文件、手册、决策记录和技术设计。
// 规格（openspec/specs/）的“来源”一行随第 5 次提交加入这项检查。

// PRD 里声明的全部锚点：单独占一行的 <a id="prd-…"></a>（正文里举例用的不算）
export function prdAnchors(prdText: string): string[] {
  return [...prdText.matchAll(/^\s*<a\s+id="(prd-[a-z0-9-]+)"\s*><\/a>\s*$/gm)].map(
    (m) => m[1] as string,
  );
}

export const prdRefs: Check = {
  name: "prd-refs",
  run(root) {
    const files = listFiles(root);
    if (!files.includes(PRD_FILE)) {
      return [`找不到 ${PRD_FILE}。PRD 是产品行为的唯一出处，恢复这个文件。`];
    }
    const anchors = new Set(prdAnchors(readText(root, PRD_FILE)));
    const errors: string[] = [];
    for (const file of files.filter((path) => path.endsWith(".md") && path !== PRD_FILE)) {
      readText(root, file)
        .split("\n")
        .forEach((line, index) => {
          for (const match of line.matchAll(/#(prd-[a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
            const anchor = match[1] as string;
            if (anchors.has(anchor)) continue;
            errors.push(
              `${file}:${index + 1} 引用了 PRD 锚点 #${anchor}，但 ${PRD_FILE} 里没有这个锚点。核对拼写；锚点列表用 grep 'a id="prd-' ${PRD_FILE} 查。不要为了通过检查去改 PRD。`,
            );
          }
        });
    }
    return errors;
  },
};
