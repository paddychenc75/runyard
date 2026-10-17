import type {
  EditorFileError,
  EditorFileResult,
  FileContent,
  SaveProblem,
} from "../../../shared/editor-files.ts";
import { type FileTab, isDirty, loadingTab, withContent } from "./file-tab.ts";

// 一个项目的编辑器会话（规格 desktop/editor「文件标签」）：打开的文件标签、选中的是哪个、保存、关闭、恢复上次的标签。
// 不认识 Monaco 和界面——内容由界面把编辑器里的变化经 edit() 交进来，文件读写经注入的 files——所以用假的文件接口就能测。
// 接缝（后续 issue 往这里接，不要另起一套状态）：
// - 自动保存三档的计时和“失去焦点”（#260）：autosave() 现在只决定关闭有未保存修改的标签时先写入还是先询问，计时器没有；
// - 磁盘上的外部修改（#260）：需要“用磁盘内容替换某个标签”的入口，加在这里；
// - 重命名、移到废纸篓后标签跟着变（#258 的文件树）：加 renameFile/removeFile 入口，保留未保存的内容。

export type AutosaveMode = "delay" | "blur" | "off";

export interface SessionFiles {
  read(path: string): Promise<EditorFileResult<FileContent>>;
  write(
    path: string,
    content: string,
    eol: "lf" | "crlf" | undefined,
  ): Promise<EditorFileResult<{ size: number }>>;
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

function saveReason(error: EditorFileError): SaveProblem {
  return error.code === "EDITOR_SAVE_FAILED" ? error.params.reason : "other";
}

export class EditorSession {
  readonly #options: EditorSessionOptions;
  #state: SessionState = { tabs: [], active: null, closePrompt: null };
  readonly #listeners = new Set<() => void>();
  /** 同一个文件的写入排队，保证后一次写的是更新的内容 */
  readonly #writes = new Map<string, Promise<boolean>>();
  #restoring = true;

  constructor(options: EditorSessionOptions) {
    this.#options = options;
  }

  getState = (): SessionState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #set(next: Partial<SessionState>): void {
    this.#state = { ...this.#state, ...next };
    for (const listener of this.#listeners) listener();
  }

  #patch(path: string, change: Partial<FileTab> | ((tab: FileTab) => FileTab)): void {
    const tabs = this.#state.tabs.map((tab) =>
      tab.path === path
        ? typeof change === "function"
          ? change(tab)
          : { ...tab, ...change }
        : tab,
    );
    this.#set({ tabs });
  }

  #remember(): void {
    if (this.#restoring) return;
    this.#options.memory.save({
      paths: this.#state.tabs.map((tab) => tab.path),
      active: this.#state.active,
    });
  }

  /** 打开项目时调用：恢复上次的文件标签；第一次打开就开入口文件。已不存在的文件跳过（DESKTOP-EDITOR-20） */
  async start(entry: string | null): Promise<void> {
    const remembered = this.#options.memory.load();
    const wanted = remembered?.paths ?? (entry === null ? [] : [entry]);
    this.#set({
      tabs: wanted.map(loadingTab),
      active:
        remembered?.active != null && wanted.includes(remembered.active)
          ? remembered.active
          : (wanted[0] ?? null),
    });
    await Promise.all(wanted.map((path) => this.#load(path)));
    // 记着的文件全不在了：退回入口文件，免得打开一个空编辑器
    if (this.#state.tabs.length === 0 && remembered !== null && remembered.paths.length > 0) {
      if (entry !== null) await this.#add(entry);
    }
    this.#restoring = false;
    this.#remember();
  }

  async #load(path: string): Promise<void> {
    const result = await this.#options.files.read(path);
    if (!this.#state.tabs.some((tab) => tab.path === path)) return;
    if (result.ok) {
      this.#patch(path, (tab) => withContent(tab, result.value));
    } else if (result.error.code === "EDITOR_NOT_FOUND") {
      this.#drop(path);
    } else {
      this.#patch(path, { view: "failed", failure: result.error });
    }
  }

  /** 去掉标签；它是选中的就换到右边那个，没有就左边那个 */
  #drop(path: string): void {
    const { tabs, active } = this.#state;
    const index = tabs.findIndex((tab) => tab.path === path);
    if (index === -1) return;
    const rest = tabs.filter((tab) => tab.path !== path);
    const next = active === path ? ((rest[index] ?? rest[index - 1])?.path ?? null) : active;
    this.#set({
      tabs: rest,
      active: next,
      closePrompt: this.#state.closePrompt === path ? null : this.#state.closePrompt,
    });
    this.#remember();
  }

  async #add(path: string): Promise<void> {
    this.#set({ tabs: [...this.#state.tabs, loadingTab(path)], active: path });
    this.#remember();
    await this.#load(path);
    this.#remember();
  }

  /** 为文件开文件标签；已有就切过去，不再开一个（DESKTOP-EDITOR-15）。文件树调用 */
  openFile(path: string): Promise<void> {
    if (this.#state.tabs.some((tab) => tab.path === path)) {
      this.select(path);
      return Promise.resolve();
    }
    return this.#add(path);
  }

  select(path: string): void {
    const { tabs, active } = this.#state;
    if (active === path || !tabs.some((tab) => tab.path === path)) return;
    const leaving = tabs.find((tab) => tab.path === active);
    this.#set({ active: path });
    this.#remember();
    // “失去焦点时”档：切到别的文件标签就写入（DESKTOP-EDITOR-24）
    if (leaving !== undefined && isDirty(leaving) && this.#options.autosave() === "blur") {
      void this.save(leaving.path);
    }
  }

  /** 编辑器里的内容变了 */
  edit(path: string, text: string): void {
    const tab = this.#state.tabs.find((candidate) => candidate.path === path);
    if (tab === undefined || tab.view !== "text" || tab.text === text) return;
    this.#patch(path, { text });
  }

  /** 写入磁盘；返回有没有成功。失败时内容和未保存标记保留，原因记在 saveError（DESKTOP-EDITOR-29） */
  save(path: string): Promise<boolean> {
    const previous = this.#writes.get(path) ?? Promise.resolve(true);
    const next = previous.then(() => this.#write(path));
    this.#writes.set(path, next);
    void next.finally(() => {
      if (this.#writes.get(path) === next) this.#writes.delete(path);
    });
    return next;
  }

  async #write(path: string): Promise<boolean> {
    const tab = this.#state.tabs.find((candidate) => candidate.path === path);
    if (tab === undefined || tab.view !== "text") return true;
    if (!isDirty(tab) && tab.saveError === null) return true;
    const snapshot = tab.text;
    const content = tab.bom ? `﻿${snapshot}` : snapshot;
    const result = await this.#options.files.write(
      path,
      content,
      tab.eol === "none" ? undefined : tab.eol,
    );
    if (result.ok) {
      // 写的过程中又输入了的话 text 已经变了，只记下写进去的那一份，未保存标记留着
      this.#patch(path, { savedText: snapshot, saveError: null });
      return true;
    }
    this.#patch(path, { saveError: saveReason(result.error) });
    return false;
  }

  /** 关闭文件标签。有未保存修改：自动保存开着先写入再关，不问；“关闭”档要问（DESKTOP-EDITOR-18、DESKTOP-EDITOR-19） */
  async requestClose(path: string): Promise<void> {
    const tab = this.#state.tabs.find((candidate) => candidate.path === path);
    if (tab === undefined) return;
    if (!isDirty(tab)) {
      this.#drop(path);
      return;
    }
    if (this.#options.autosave() === "off") {
      this.#set({ closePrompt: path });
      return;
    }
    // 写入失败就不关：内容不能丢
    if (await this.save(path)) this.#drop(path);
  }

  async answerClose(answer: ClosePromptAnswer): Promise<void> {
    const path = this.#state.closePrompt;
    if (path === null) return;
    this.#set({ closePrompt: null });
    if (answer === "cancel") return;
    if (answer === "discard" || (await this.save(path))) this.#drop(path);
  }

  /** ⌘W：先关当前的文件标签；没有文件标签返回 false，交给调用方关项目标签页（DESKTOP-EDITOR-17） */
  closeCurrent(): boolean {
    const { active } = this.#state;
    if (active === null) return false;
    void this.requestClose(active);
    return true;
  }
}
