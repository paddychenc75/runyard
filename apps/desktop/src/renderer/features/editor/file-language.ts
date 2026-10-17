import { LARGE_FILE_BYTES } from "../../../shared/editor-files.ts";

// 文件名到编辑器语言、文件大小到处理方式的对应（规格 DESKTOP-EDITOR-37、DESKTOP-EDITOR-54、DESKTOP-EDITOR-22）。
// 语言 id 是 Monaco 里注册的那几个（runtime.ts）；.tsx 也用 typescript、.jsx 也用 javascript，
// 因为 TS 的语言服务只挂在这两个 id 上，着色另有一份 TSX 语法覆盖（决策依据：K8 证据“装法”第 5 条）。

const BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  vue: "vue",
  css: "css",
  html: "html",
  htm: "html",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  go: "go",
};

export const PLAIN_LANGUAGE = "plaintext";

export function languageOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return PLAIN_LANGUAGE;
  return BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? PLAIN_LANGUAGE;
}

/** 完整语法高亮的上限（含）：整份着色的耗时随大小线性增长，1 MB 约 1.8 秒（K8 实测，规格 DESKTOP-EDITOR-54） */
export const HIGHLIGHT_MAX_BYTES = 1024 * 1024;

/** full：高亮加智能提示；plain：当纯文本（1 到 5 MB）；plain-large：纯文本且关智能提示（超过 5 MB） */
export type HighlightMode = "full" | "plain" | "plain-large";

export function highlightModeOf(size: number): HighlightMode {
  if (size <= HIGHLIGHT_MAX_BYTES) return "full";
  return size <= LARGE_FILE_BYTES ? "plain" : "plain-large";
}

/** 实际交给编辑器的语言：不做高亮的文件一律按纯文本 */
export function editorLanguageOf(path: string, mode: HighlightMode): string {
  return mode === "full" ? languageOf(path) : PLAIN_LANGUAGE;
}
