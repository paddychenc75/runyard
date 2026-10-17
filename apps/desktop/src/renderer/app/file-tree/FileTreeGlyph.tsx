import type { FileEntry } from "../../../shared/editor-files.ts";

// 文件树里的图标：设计稿 Web 的折叠箭头、文件夹和文件轮廓，线条描边，颜色按文件类型取设计变量
// （--color-tree-*）。@runyard/ui 的图标集没有这几个形状，设计稿也只在文件树里用，所以画在这里。

const FOLDER_PATH =
  "M1.5 4.5a1 1 0 0 1 1-1h3.2l1.5 1.6h6.3a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z";
const FILE_PATH =
  "M4 1.5h5l3.5 3.5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5zM9 1.5V5h3.5";

export type TreeIconTone = "folder" | "typescript" | "css" | "html" | "data" | "other";

const TONE_BY_EXTENSION: Record<string, TreeIconTone> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "typescript",
  jsx: "typescript",
  mjs: "typescript",
  cjs: "typescript",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  json: "data",
  yaml: "data",
  yml: "data",
  toml: "data",
};

export function toneOf(entry: Pick<FileEntry, "name" | "kind">): TreeIconTone {
  if (entry.kind === "folder") return "folder";
  const dot = entry.name.lastIndexOf(".");
  if (dot <= 0) return "other";
  return TONE_BY_EXTENSION[entry.name.slice(dot + 1).toLowerCase()] ?? "other";
}

export function Chevron({ visible, open }: { visible: boolean; open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-chevron={visible ? (open ? "open" : "closed") : "none"}
    >
      <path d="M2 3.5 5 6.5 8 3.5" />
    </svg>
  );
}

export function EntryIcon({ kind, tone }: { kind: "file" | "folder"; tone: TreeIconTone }) {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      data-tone={tone}
    >
      <path d={kind === "folder" ? FOLDER_PATH : FILE_PATH} />
    </svg>
  );
}
