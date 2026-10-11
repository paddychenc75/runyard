import { listFiles, proseLines, readText } from "./docs.ts";
import { type Check, listWorkspacePackages } from "./workspace.ts";

// docs-structure：说明文件的固定结构（技术设计 §9.1、§9.4）。
// 1. 每个工作区包（apps/*、packages/*、tooling）和 templates/ 都有自己的 AGENTS.md。
// 2. 包一级的 AGENTS.md 有固定五节，顺序不变。
// 3. docs/guides/ 里的手册有固定四节，顺序不变（命令表和踩坑记录不是手册，不查）。
// openspec/ 不是包，也不许放 AGENTS.md（技术设计 §9.6.2），所以不在范围里。

export const PACKAGE_SECTIONS = ["用途", "对外暴露什么", "本包特有的规则", "子目录地图", "测试"];
export const GUIDE_SECTIONS = ["何时用", "步骤", "验证", "完成标准"];
const NOT_PLAYBOOKS = new Set(["docs/guides/commands.md", "docs/guides/pitfalls.md"]);

function missingSections(text: string, required: string[]): string | undefined {
  const headings = proseLines(text)
    .map((line) => /^##\s+(.+?)\s*$/.exec(line)?.[1])
    .filter((heading) => heading !== undefined);
  const found = headings.filter((heading) => required.includes(heading));
  if (found.join("|") === required.join("|")) return undefined;
  return `需要这几个二级标题并按这个顺序：${required.map((s) => `## ${s}`).join("、")}；现在有的是：${found.map((s) => `## ${s}`).join("、") || "（一个都没有）"}`;
}

export const docsStructure: Check = {
  name: "docs-structure",
  run: (root) => checkStructure(root),
};

export function checkStructure(root: string): string[] {
  const files = listFiles(root);
  const errors: string[] = [];

  const packageDirs = listWorkspacePackages(root).map((pkg) => pkg.dir);
  if (files.some((file) => file.startsWith("templates/"))) packageDirs.push("templates");
  for (const dir of packageDirs) {
    const has = files.includes(`${dir}/AGENTS.md`);
    if (!has) {
      errors.push(
        `${dir} 没有 AGENTS.md。在建这个包的同一个 PR 里写一份，固定五节：${PACKAGE_SECTIONS.join("、")}（不超过 80 行）。`,
      );
    }
  }
  for (const file of files) {
    if (file.endsWith("/AGENTS.md")) {
      const problem = missingSections(readText(root, file), PACKAGE_SECTIONS);
      if (problem !== undefined) errors.push(`${file} 缺固定章节。${problem}。`);
    }
    if (/^docs\/guides\/[^/]+\.md$/.test(file) && !NOT_PLAYBOOKS.has(file)) {
      const problem = missingSections(readText(root, file), GUIDE_SECTIONS);
      if (problem !== undefined) errors.push(`${file} 不符合手册的固定结构。${problem}。`);
    }
  }
  return errors;
}
