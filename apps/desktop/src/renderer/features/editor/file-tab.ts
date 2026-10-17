import type {
  EditorFileError,
  FileContent,
  LineEnding,
  SaveProblem,
} from "../../../shared/editor-files.ts";
import { type HighlightMode, highlightModeOf } from "./file-language.ts";

// 一个文件标签的数据和从磁盘内容到它的转换（规格 desktop/editor「文件标签」）。纯数据，不认识 Monaco 和界面。

/** loading 读取中；text 能编辑；binary、too-large 不在编辑器里打开；failed 读取失败 */
export type FileTabView = "loading" | "text" | "binary" | "too-large" | "failed";

export interface FileTab {
  /** 标签的身份，打开时定下、改名后不变：编辑器靠它认出“还是这个标签”，带走光标位置 */
  id: string;
  /** 项目内相对路径 */
  path: string;
  view: FileTabView;
  /** 编辑器里此刻的内容（已去掉开头的 BOM，换行符是 eol 那一种） */
  text: string;
  /** 磁盘上最后一次读到或写入的内容，与 text 比较得出“未保存” */
  savedText: string;
  /** 写回时统一成的换行；none 是原文件没有换行，写回不统一 */
  eol: "lf" | "crlf" | "none";
  /** 原文件开头有 BOM：编辑器里不显示，写回时补上 */
  bom: boolean;
  /** 原文件的换行符不统一（保存时统一成多数那种）；提示由自动保存那个 issue 做 */
  mixedEol: boolean;
  size: number;
  mode: HighlightMode;
  /** 最近一次保存失败的原因；保存成功后清掉。内容和未保存标记照旧保留 */
  saveError: SaveProblem | null;
  /** view 为 failed 时的原因 */
  failure: EditorFileError | null;
}

export function loadingTab(path: string, id: string = path): FileTab {
  return {
    id,
    path,
    view: "loading",
    text: "",
    savedText: "",
    eol: "none",
    bom: false,
    mixedEol: false,
    size: 0,
    mode: "full",
    saveError: null,
    failure: null,
  };
}

export function isDirty(tab: FileTab): boolean {
  return tab.view === "text" && tab.text !== tab.savedText;
}

function countLineEndings(text: string): { crlf: number; lf: number } {
  let crlf = 0;
  let lf = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    if (i > 0 && text[i - 1] === "\r") crlf += 1;
    else lf += 1;
  }
  return { crlf, lf };
}

/** 全部统一成指定的换行；单独的 \r 不碰 */
export function unifyLineEndings(text: string, eol: "lf" | "crlf"): string {
  const lf = text.replace(/\r\n/g, "\n");
  return eol === "lf" ? lf : lf.replace(/\n/g, "\r\n");
}

function resolveEol(declared: LineEnding, text: string): "lf" | "crlf" | "none" {
  if (declared !== "mixed") return declared;
  const { crlf, lf } = countLineEndings(text);
  // 数量相同统一成 LF（规格“自动保存三档”）
  return crlf > lf ? "crlf" : "lf";
}

/** 把读到的内容装进标签：去 BOM、混用换行统一成多数那种；binary、too-large 保留大小供说明用 */
export function withContent(tab: FileTab, content: FileContent): FileTab {
  if (content.kind !== "text") {
    return { ...tab, view: content.kind, size: content.size, failure: null };
  }
  const bom = content.content.startsWith("﻿");
  const body = bom ? content.content.slice(1) : content.content;
  const eol = resolveEol(content.eol, body);
  const text = content.eol === "mixed" && eol !== "none" ? unifyLineEndings(body, eol) : body;
  return {
    ...tab,
    view: "text",
    text,
    savedText: text,
    eol,
    bom,
    mixedEol: content.eol === "mixed",
    size: content.size,
    mode: highlightModeOf(content.size),
    saveError: null,
    failure: null,
  };
}
