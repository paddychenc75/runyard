import type { EditorFileResult, FileChange, FileContent } from "../../../shared/editor-files.ts";
import type { FileTab } from "./file-tab.ts";

// 编辑会话（EditorSession）对外的类型和常量。

export type AutosaveMode = "delay" | "blur" | "off";

/** delay 档：停止输入多久后写入（规格 DESKTOP-EDITOR-23；设置页做出来之前只有这一个值） */
export const AUTOSAVE_DELAY_MS = 1000;

export interface SessionFiles {
  read(path: string): Promise<EditorFileResult<FileContent>>;
  write(
    path: string,
    content: string,
    eol: "lf" | "crlf" | undefined,
  ): Promise<EditorFileResult<{ size: number }>>;
  /** 开始监听项目文件夹的变化（没有这一项就不处理外部修改）；返回停止监听的函数 */
  watch?(listener: (changes: FileChange[]) => void): () => void;
}

/** 上次关闭项目时打开的文件标签（规格 DESKTOP-EDITOR-20）；存取由调用方决定放在哪 */
export interface RememberedFiles {
  paths: string[];
  active: string | null;
}
export interface OpenFilesMemory {
  /** 从没存过是 null（第一次打开，要打开入口文件）；存过空列表是用户把标签都关了 */
  load(): RememberedFiles | null;
  save(state: RememberedFiles): void;
}

export interface SessionState {
  tabs: readonly FileTab[];
  active: string | null;
  /** 正在等用户回答“保存、不保存、取消”的文件标签；没有是 null（规格 DESKTOP-EDITOR-19） */
  closePrompt: string | null;
}

export type ClosePromptAnswer = "save" | "discard" | "cancel";

export interface EditorSessionOptions {
  files: SessionFiles;
  memory: OpenFilesMemory;
  /** 当前的自动保存档位；默认值和设置页随 #260，现在由调用方给 */
  autosave: () => AutosaveMode;
}
