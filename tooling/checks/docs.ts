import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 文档类检查共用的读取工具：列文件、认出“给智能体看的说明文件”、取出行内代码和代码块。
// 只读文件，不联网，不调用 git（测试用的假仓库不是 git 仓库）。

// 不进仓库或不属于仓库内容的目录：依赖、构建物、本机归档的残留、渲染出的图片
const SKIP_DIRS = new Set(["node_modules", ".git", ".tsbuild", ".turbo", "dist", "coverage"]);
const SKIP_PATHS = new Set([
  "docs/discussions",
  "docs/prototype",
  "docs/design-renders",
  "tooling/design-render/png",
  "tooling/design-render/build",
  "tooling/design-render/sheets",
]);

export const PRD_FILE = "docs/product/02-prd.md";
export const TECH_DESIGN_FILE = "docs/product/03-tech-design.md";
export const GLOSSARY_FILE = "docs/glossary.md";
export const ADR_DIR = "docs/architecture/decisions";

// 列出仓库里的全部文件，返回相对仓库根、用 / 分隔的路径（Windows 上也一样）
export function listFiles(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !SKIP_PATHS.has(path)) walk(path);
      } else {
        result.push(path);
      }
    }
  };
  walk("");
  return result.sort();
}

export function readText(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

// 给智能体和开发者看的说明文件：全部 Markdown，去掉两份产品文档（负责人的中文文档，
// 写了大量以后才有的路径和命令）和设计源文件目录。
export function isAgentDoc(path: string): boolean {
  if (!path.endsWith(".md")) return false;
  if (path === PRD_FILE || path === TECH_DESIGN_FILE) return false;
  return !path.startsWith("docs/design/");
}

// 决策记录接受之后不改正文，里面的路径和命令是当时的事实，所以不查路径和命令（链接仍然查）
export function isLiveDoc(path: string): boolean {
  return isAgentDoc(path) && !path.startsWith(`${ADR_DIR}/`);
}

export interface CodeSpan {
  /** 行号，从 1 开始 */
  line: number;
  text: string;
  /** true = 来自 ``` 代码块的一整行；false = 行内的 `代码` */
  fenced: boolean;
}

// 取出一份 Markdown 里的全部代码：代码块逐行返回，行内代码逐个返回
export function codeSpans(text: string): CodeSpan[] {
  const spans: CodeSpan[] = [];
  let inFence = false;
  text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (inFence) {
      if (raw.trim() !== "") spans.push({ line, text: raw.trim(), fenced: true });
      return;
    }
    for (const match of raw.matchAll(/`([^`]+)`/g)) {
      spans.push({ line, text: (match[1] as string).trim(), fenced: false });
    }
  });
  return spans;
}

// 去掉代码块和行内代码后的正文行（保持行号不变），用来找链接和标题
export function proseLines(text: string): string[] {
  let inFence = false;
  return text.split("\n").map((raw) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : raw.replace(/`[^`]*`/g, "");
  });
}

// 仓库顶层的名字：真实存在的，加上技术设计 §3.1 给以后预留的。
// 文档里以这些名字开头的路径都当作“仓库路径”来核对。
const RESERVED_ROOTS = [
  "apps",
  "packages",
  "templates",
  "docs",
  "tooling",
  "security",
  "openspec",
  "spikes",
  ".claude",
  ".github",
];

export function repoRoots(files: string[]): Set<string> {
  const roots = new Set(RESERVED_ROOTS);
  for (const file of files) {
    const slash = file.indexOf("/");
    if (slash > 0) roots.add(file.slice(0, slash));
  }
  return roots;
}

// 路径是否存在：files 里有这个文件，或有以它为前缀的文件（即它是目录）
export function pathExists(files: string[], path: string): boolean {
  const clean = path.replace(/\/+$/, "");
  return files.some((file) => file === clean || file.startsWith(`${clean}/`));
}
