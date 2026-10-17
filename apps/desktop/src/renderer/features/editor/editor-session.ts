import type { EditorFileError, FileChange, SaveProblem } from "../../../shared/editor-files.ts";
import { type DiskHost, reconcileDisk, useDiskVersion } from "./disk-change.ts";
import { type FileTab, isDirty, loadingTab, withContent } from "./file-tab.ts";
import { PathTimers } from "./path-timers.ts";
import {
  AUTOSAVE_DELAY_MS,
  type ClosePromptAnswer,
  type EditorSessionOptions,
  type SessionState,
} from "./session-types.ts";

// 一个项目的编辑器会话（规格 desktop/editor「文件标签」）：打开的文件标签、选中的是哪个、保存、关闭、恢复上次的标签。
// 不认识 Monaco 和界面——内容由界面把编辑器里的变化经 edit() 交进来，文件读写经注入的 files——所以用假的文件接口就能测。
// 自动保存三档（#260）：delay 档在 edit() 里为每个文件各自计时，blur 档由 select() 和 blur() 触发，off 档只有 save()。
// 磁盘上的外部修改（#260）经 files.watch() 的变化推送进来：没有未保存修改就换成磁盘内容，
// 有就标 conflict 并暂停这个文件的自动保存，等 useDisk() / keepMine()；被删除的标 deleted，只有 save() 重新创建。

function saveReason(error: EditorFileError): SaveProblem {
  return error.code === "EDITOR_SAVE_FAILED" ? error.params.reason : "other";
}

export class EditorSession {
  readonly #options: EditorSessionOptions;
  #state: SessionState = { tabs: [], active: null, closePrompt: null };
  readonly #listeners = new Set<() => void>();
  /** 同一个文件的写入排队，保证后一次写的是更新的内容 */
  readonly #writes = new Map<string, Promise<boolean>>();
  /** delay 档每个文件一个计时器 */
  readonly #timers = new PathTimers();
  /** 回答“保存、不保存、取消”的人在等：关项目标签页和退出时用，回答不关文件标签 */
  #answer: ((answer: ClosePromptAnswer) => void) | null = null;
  #stopWatching: (() => void) | null = null;
  #restoring = true;
  #disposed = false;
  #nextId = 1;

  constructor(options: EditorSessionOptions) {
    this.#options = options;
  }

  /** 项目标签页关掉时丢弃会话：停掉计时和监听 */
  dispose(): void {
    this.#disposed = true;
    this.#timers.cancelAll();
    this.#stopWatching?.();
    this.#stopWatching = null;
  }

  getState = (): SessionState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #newId(): string {
    // 不用路径当身份：改名后又打开同名的文件时会撞
    return `tab-${this.#nextId++}`;
  }

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
      tabs: wanted.map((path) => loadingTab(path, this.#newId())),
      active:
        remembered?.active != null && wanted.includes(remembered.active)
          ? remembered.active
          : (wanted[0] ?? null),
    });
    // 先开始监听再读：读之后发生的变化不会漏
    if (!this.#disposed) {
      this.#stopWatching =
        this.#options.files.watch?.((changes) => this.#onDiskChanges(changes)) ?? null;
    }
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
    this.#set({ tabs: [...this.#state.tabs, loadingTab(path, this.#newId())], active: path });
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
    if (
      leaving !== undefined &&
      this.#options.autosave() === "blur" &&
      this.#canAutosave(leaving.path)
    ) {
      void this.save(leaving.path);
    }
  }

  /**
   * 文件或文件夹改名了（文件树调用，规格 DESKTOP-EDITOR-09、10）：路径是它或在它下面的文件标签换成新路径，
   * 内容、未保存的修改、写回用的换行符和 BOM 都留着，之后的保存写进新路径。
   */
  renamePath(from: string, to: string): void {
    const move = (path: string): string | null => {
      if (path === from) return to;
      return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : null;
    };
    const { tabs, active, closePrompt } = this.#state;
    this.#set({
      tabs: tabs.map((tab) => {
        const moved = move(tab.path);
        return moved === null ? tab : { ...tab, path: moved };
      }),
      active: active === null ? null : (move(active) ?? active),
      closePrompt: closePrompt === null ? null : (move(closePrompt) ?? closePrompt),
    });
    this.#remember();
  }

  /** 文件或文件夹移到废纸篓了（文件树调用，DESKTOP-EDITOR-11）：它和它下面的文件标签直接关闭，不询问——文件树移走前已把未保存的内容写进去 */
  removePath(path: string): void {
    for (const tab of this.#state.tabs) {
      if (tab.path === path || tab.path.startsWith(`${path}/`)) this.#drop(tab.path);
    }
  }

  /** 关闭或退出时会不会要问用户（界面要先把这个项目标签页切到前面） */
  mayAsk(): boolean {
    return this.#state.tabs.some((tab) => this.#needsAsking(tab));
  }

  /** 这个文件有没保存的修改就返回要写进磁盘的全部内容（含 BOM），没有是 undefined；文件树移走前用它先保存（DESKTOP-EDITOR-12） */
  unsavedContent(path: string): string | undefined {
    const tab = this.#state.tabs.find((candidate) => candidate.path === path);
    if (tab === undefined || !isDirty(tab)) return undefined;
    return tab.bom ? `\uFEFF${tab.text}` : tab.text;
  }

  /** 编辑器里的内容变了 */
  edit(path: string, text: string): void {
    const tab = this.#state.tabs.find((candidate) => candidate.path === path);
    if (tab === undefined || tab.view !== "text" || tab.text === text) return;
    this.#patch(path, { text });
    this.#schedule(path);
  }

  #cancelTimer(path: string): void {
    this.#timers.cancel(path);
  }

  /** delay 档：每次输入都重新计时，停下满 1 秒才写（DESKTOP-EDITOR-23）；等用户选择的和已删除的文件不自动写 */
  #schedule(path: string): void {
    this.#cancelTimer(path);
    if (this.#disposed || this.#options.autosave() !== "delay") return;
    this.#timers.restart(path, AUTOSAVE_DELAY_MS, () => {
      if (this.#canAutosave(path)) void this.save(path);
    });
  }

  #canAutosave(path: string): boolean {
    const tab = this.#state.tabs.find((candidate) => candidate.path === path);
    return tab !== undefined && isDirty(tab) && !tab.conflict && !tab.deleted;
  }

  /** 失去焦点（点了预览或别的区域、切到别的应用、关窗口）：blur 档把所有有修改的文件写入（DESKTOP-EDITOR-24） */
  blur(): void {
    if (this.#options.autosave() !== "blur") return;
    for (const tab of this.#state.tabs) if (this.#canAutosave(tab.path)) void this.save(tab.path);
  }

  /**
   * ⌘S 和各种自动保存都走这里：立即写入磁盘，任何一档都一样（DESKTOP-EDITOR-26）；返回有没有成功。
   * 失败时内容和未保存标记保留，原因记在 saveError（DESKTOP-EDITOR-29）。
   * 磁盘上的新内容在等用户选择时不写，免得盖掉它（DESKTOP-EDITOR-32）；已删除的文件在这里重新创建（DESKTOP-EDITOR-35）。
   */
  save(path: string): Promise<boolean> {
    if (this.#state.tabs.find((candidate) => candidate.path === path)?.conflict) {
      return Promise.resolve(false);
    }
    return this.#enqueueWrite(path);
  }

  #enqueueWrite(path: string): Promise<boolean> {
    this.#cancelTimer(path);
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
    if (!isDirty(tab) && tab.saveError === null && !tab.deleted) return true;
    const snapshot = tab.text;
    const content = tab.bom ? `﻿${snapshot}` : snapshot;
    this.#patch(path, { saving: true });
    const result = await this.#options.files.write(
      path,
      content,
      tab.eol === "none" ? undefined : tab.eol,
    );
    if (result.ok) {
      // 写的过程中又输入了的话 text 已经变了，只记下写进去的那一份，未保存标记留着。
      // 换行不统一的提示只给一次：写过一次，磁盘上就已经统一了（DESKTOP-EDITOR-55）
      this.#patch(path, {
        savedText: snapshot,
        saveError: null,
        deleted: false,
        mixedEol: false,
        saving: false,
      });
      return true;
    }
    this.#patch(path, { saveError: saveReason(result.error), saving: false });
    return false;
  }

  /** 关闭或退出时这个文件要不要先问：“关闭”档，以及自动保存帮不上的（等用户选择的、已删除的） */
  #needsAsking(tab: FileTab): boolean {
    return isDirty(tab) && (this.#options.autosave() === "off" || tab.conflict || tab.deleted);
  }

  /** 关闭文件标签。有未保存修改：自动保存开着先写入再关，不问；“关闭”档要问（DESKTOP-EDITOR-18、DESKTOP-EDITOR-19） */
  async requestClose(path: string): Promise<void> {
    const tab = this.#state.tabs.find((candidate) => candidate.path === path);
    if (tab === undefined) return;
    if (!isDirty(tab)) {
      this.#drop(path);
      return;
    }
    if (this.#needsAsking(tab)) {
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
    // 关项目标签页、退出时的询问：回答交给等着的流程，文件标签留着
    if (this.#answer !== null) {
      const resolve = this.#answer;
      this.#answer = null;
      resolve(answer);
      return;
    }
    if (answer === "cancel") return;
    if (answer === "discard" || (await this.#saveForClose(path))) this.#drop(path);
  }

  /** 询问的保存：等用户选择的文件是用户明确要覆盖，所以绕开 save() 对它的保护 */
  #saveForClose(path: string): Promise<boolean> {
    this.#patch(path, { conflict: false });
    return this.#enqueueWrite(path);
  }

  /**
   * 关闭项目标签页和退出应用之前调用（DESKTOP-EDITOR-27、28）：有未保存修改的文件先写入，
   * 自动保存帮不上的（“关闭”档、等用户选择的、已删除的）先问。返回 false 表示要中止这次关闭或退出
   * （选了取消，或写入失败——此时回到那个文件，修改还在）。
   */
  async flushForClose(): Promise<boolean> {
    this.#timers.cancelAll();
    for (const { path } of [...this.#state.tabs]) {
      const tab = this.#state.tabs.find((candidate) => candidate.path === path);
      if (tab === undefined || !isDirty(tab)) continue;
      if (this.#needsAsking(tab)) {
        this.#set({ active: path, closePrompt: path });
        const answer = await new Promise<ClosePromptAnswer>((resolve) => {
          this.#answer = resolve;
        });
        if (answer === "cancel") return false;
        if (answer === "discard") continue;
        if (!(await this.#saveForClose(path))) return this.#showFailure(path);
      } else if (!(await this.save(path))) {
        return this.#showFailure(path);
      }
    }
    return true;
  }

  #showFailure(path: string): false {
    this.#set({ active: path });
    return false;
  }

  #onDiskChanges(changes: FileChange[]): void {
    for (const change of changes) {
      // 自己保存引起的变化不算外部修改（DESKTOP-EDITOR-36）
      if (change.self) continue;
      const tab = this.#state.tabs.find((candidate) => candidate.path === change.path);
      if (tab?.view === "text") void reconcileDisk(this.#diskHost, change.path);
    }
  }

  readonly #diskHost: DiskHost = {
    tab: (path) => this.#state.tabs.find((candidate) => candidate.path === path),
    patch: (path, change) => this.#patch(path, change),
    read: (path) => this.#options.files.read(path),
    settled: (path) => this.#writes.get(path) ?? Promise.resolve(true),
    cancelTimer: (path) => this.#cancelTimer(path),
    gone: () => this.#disposed,
  };

  /** 提示里的“用磁盘上的版本”：丢掉我的修改，换成磁盘现在的内容，之后自动保存照常（DESKTOP-EDITOR-33） */
  useDisk(path: string): Promise<void> {
    return useDiskVersion(this.#diskHost, path);
  }

  /** 提示里的“保留我的修改”：把我的内容写进磁盘（DESKTOP-EDITOR-34） */
  async keepMine(path: string): Promise<void> {
    await this.#saveForClose(path);
  }

  /** ⌘W：先关当前的文件标签；没有文件标签返回 false，交给调用方关项目标签页（DESKTOP-EDITOR-17） */
  closeCurrent(): boolean {
    const { active } = this.#state;
    if (active === null) return false;
    void this.requestClose(active);
    return true;
  }
}
