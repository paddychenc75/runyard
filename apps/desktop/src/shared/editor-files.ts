// 编辑器的文件服务对界面暴露的类型（规格 desktop/editor，技术设计 §6.2、§6.4）。
// 服务在主进程（fs-host 的职责）：只认“项目 id 加项目内相对路径”，不接受绝对路径；
// 错误只发代码加参数，句子由界面用文案包生成，所以这里没有任何给人看的文字。

/** 超过它：能打开，但关闭语法高亮和智能提示并说明（规格“文件标签”） */
export const LARGE_FILE_BYTES = 5 * 1024 * 1024;
/** 超过它：不打开，提供“在外部编辑器中打开” */
export const MAX_OPEN_BYTES = 50 * 1024 * 1024;

/** 文件里用的换行：lf、crlf、两种都有（mixed）、没有换行（none） */
export type LineEnding = "lf" | "crlf" | "mixed" | "none";

export type NameProblem = "empty" | "separator" | "dot" | "control" | "too-long";
export type SaveProblem = "read-only" | "permission" | "other";

/** 错误代码到参数。路径一律是项目内相对路径（正斜杠），项目根是空串 */
export interface EditorFileErrors {
  EDITOR_PROJECT_UNKNOWN: { project: string };
  /** 路径逃出项目文件夹（含符号链接逃出），或是项目根本身（不能被改名、移走） */
  EDITOR_PATH_OUTSIDE: { path: string };
  EDITOR_NOT_FOUND: { path: string };
  EDITOR_NOT_A_FILE: { path: string };
  EDITOR_NOT_A_FOLDER: { path: string };
  EDITOR_NAME_INVALID: { name: string; reason: NameProblem };
  EDITOR_NAME_EXISTS: { name: string };
  EDITOR_SAVE_FAILED: { path: string; reason: SaveProblem };
  /** 放不进废纸篓：文件留在原处，不会改成永久删除（决策记录 0010） */
  EDITOR_TRASH_FAILED: { path: string };
  EDITOR_IO_FAILED: { path: string };
}
export type EditorFileErrorCode = keyof EditorFileErrors;

export type EditorFileError = {
  [C in EditorFileErrorCode]: { code: C; params: EditorFileErrors[C] };
}[EditorFileErrorCode];

/** 动作的结果：失败不抛，折进 error */
export type EditorFileResult<T> = { ok: true; value: T } | { ok: false; error: EditorFileError };

export interface FileEntry {
  name: string;
  /** 项目内相对路径 */
  path: string;
  kind: "file" | "folder";
  /** 符号链接（kind 是它指向的东西的种类；指向项目外的链接照样列出，但读写会被拒绝） */
  symlink: boolean;
}

export type FileContent =
  | { kind: "text"; content: string; eol: LineEnding; size: number; large: boolean }
  /** 不是文本：不在编辑器里打开，界面说明原因并给“在访达中显示” */
  | { kind: "binary"; size: number }
  /** 超过 MAX_OPEN_BYTES：不读内容 */
  | { kind: "too-large"; size: number };

/** 磁盘上的变化。self 为真表示是本服务自己的保存引起的（内容与刚写入的完全一致），不算外部修改 */
export interface FileChange {
  kind: "add" | "change" | "remove";
  path: string;
  self: boolean;
}

export interface FilesChanged {
  project: string;
  changes: FileChange[];
}

export interface FileTarget {
  project: string;
  path: string;
}

/** 界面可调用的文件方法（桥的白名单见 desktop-bridge.ts） */
export interface EditorFileMethods {
  "files.list": { param: FileTarget; result: EditorFileResult<FileEntry[]> };
  "files.read": { param: FileTarget; result: EditorFileResult<FileContent> };
  /** eol 缺省按 content 原样写；给 lf 或 crlf 就把全部换行统一成它（保留文件原来的换行） */
  "files.write": {
    param: FileTarget & { content: string; eol?: "lf" | "crlf" };
    result: EditorFileResult<{ size: number }>;
  };
  /** 在 path（文件夹，项目根是空串）下新建；同名不创建也不覆盖 */
  "files.create": {
    param: FileTarget & { kind: "file" | "folder"; name: string };
    result: EditorFileResult<{ path: string }>;
  };
  "files.rename": {
    param: FileTarget & { name: string };
    result: EditorFileResult<{ path: string }>;
  };
  /** unsaved 有值就先把它原子地写入再移走（规格 DESKTOP-EDITOR-12）；写入失败则不移走 */
  "files.trash": {
    param: FileTarget & { unsaved?: string };
    result: EditorFileResult<{ restorable: boolean }>;
  };
  /** 开始监听项目文件夹，变化经事件 files.changed 推来；重复调用无副作用 */
  "files.watch": { param: { project: string }; result: EditorFileResult<null> };
  "files.unwatch": { param: { project: string }; result: undefined };
}
export type EditorFileMethod = keyof EditorFileMethods;

export const editorFileMethodNames: readonly EditorFileMethod[] = [
  "files.list",
  "files.read",
  "files.write",
  "files.create",
  "files.rename",
  "files.trash",
  "files.watch",
  "files.unwatch",
];
