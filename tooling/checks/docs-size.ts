import { ADR_DIR, listFiles, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// docs-size：说明文件不超过行数上限（技术设计 §9.1 的表）。
// 超了不要调大上限：把内容挪到更具体的文件（包一级的 AGENTS.md、手册），或删掉过时的行。

// 返回这个文件的行数上限；不受限制的文件返回 undefined
export function lineLimit(path: string): number | undefined {
  if (path === "AGENTS.md") return 150;
  if (path.endsWith("/AGENTS.md")) return 80;
  if (path === "docs/product/README.md") return 40;
  if (/^docs\/guides\/[^/]+\.md$/.test(path)) return 200;
  if (path === "docs/architecture/overview.md") return 60;
  if (path.startsWith(`${ADR_DIR}/`) && path.endsWith(".md")) return 60;
  return undefined;
}

export const docsSize: Check = {
  name: "docs-size",
  run(root) {
    const errors: string[] = [];
    for (const file of listFiles(root)) {
      const limit = lineLimit(file);
      if (limit === undefined) continue;
      const lines = readText(root, file).trimEnd().split("\n").length;
      if (lines > limit) {
        errors.push(
          `${file} 有 ${lines} 行，上限是 ${limit} 行。不要调大上限：把细节挪到更具体的文件（包一级的 AGENTS.md 或 docs/guides/ 的手册），或删掉过时的内容。`,
        );
      }
    }
    return errors;
  },
};
