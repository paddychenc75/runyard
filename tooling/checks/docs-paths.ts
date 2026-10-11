import { codeSpans, isLiveDoc, listFiles, pathExists, readText, repoRoots } from "./docs.ts";
import type { Check } from "./workspace.ts";

// docs-paths：说明文件里用反引号写到的仓库路径真的存在（技术设计 §9.4）。
// 认作“仓库路径”的条件：行内代码、不含空格、带 /、第一段是仓库顶层的名字（docs、tooling、packages 等）。
// 带占位符的路径（<id>、*、{a,b}、NNNN）只核对占位符之前的那一段目录。
// 决策记录不查（接受后不改正文，里面的路径是当时的事实）。

const PLACEHOLDER = /[<>*{}[\]…]|NNNN/;

// 把一段行内代码变成要核对的路径；不是仓库路径就返回 undefined
export function pathToCheck(span: string, roots: Set<string>): string | undefined {
  const text = span.replace(/[，。；：、,;:]+$/, "");
  if (/\s/.test(text) || !text.includes("/")) return undefined;
  const segments = text.replace(/^\.\//, "").split("/");
  if (!roots.has(segments[0] as string)) return undefined;
  const kept: string[] = [];
  for (const segment of segments) {
    if (PLACEHOLDER.test(segment)) break;
    kept.push(segment);
  }
  const path = kept.join("/").replace(/\/+$/, "");
  return path === "" ? undefined : path;
}

export const docsPaths: Check = {
  name: "docs-paths",
  run(root) {
    const files = listFiles(root);
    const roots = repoRoots(files);
    const errors: string[] = [];
    for (const file of files.filter(isLiveDoc)) {
      for (const span of codeSpans(readText(root, file))) {
        if (span.fenced) continue;
        const path = pathToCheck(span.text, roots);
        if (path === undefined || pathExists(files, path)) continue;
        errors.push(
          `${file}:${span.line} 写到的路径 ${span.text} 不存在（核对的是 ${path}）。改成现在真实存在的路径；如果它是以后才有的东西，就不要现在写进说明，等实现它的那个 PR 再写。`,
        );
      }
    }
    return errors;
  },
};
