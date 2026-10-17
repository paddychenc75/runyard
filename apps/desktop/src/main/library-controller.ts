import type { Locale } from "@runyard/i18n";
import type { Playground, RunSnapshot, TemplateRecord } from "@runyard/protocol";
import type { ConsoleAppend, ConsoleLine } from "../shared/console-state.ts";
import type { CreateRequest, CreateResult } from "../shared/desktop-bridge.ts";
import type { Bounds } from "../shared/layout.ts";
import type { DesktopError, LibraryState } from "../shared/library-state.ts";
import {
  buildLibraryState,
  latestRunByPlayground,
  needsStopOnClose,
  ownedActiveRun,
  previewUrlFor,
} from "./build-library-state.ts";
import { ConsoleLogs } from "./console-logs.ts";
import type {
  LibraryClient,
  LibraryControllerOptions,
  PreviewHost,
  SystemActions,
} from "./controller-hosts.ts";
import { createPlayground } from "./create-playground.ts";
import { toDesktopError } from "./desktop-error.ts";
import { frameBeforeCrash } from "./last-frame.ts";
import { readConfirmClose, readLibraryRoot } from "./library-root.ts";
import { classifyStartError } from "./start-error.ts";
import { StartTimeline } from "./start-timeline.ts";
import { LIBRARY_TAB, WorkspaceTabs } from "./workspace-tabs.ts";

// 窗口背后的逻辑：向管理进程要项目、模板、运行，转成界面看的状态；执行界面发来的动作。
// 不认识 Electron：预览通过 PreviewHost 这个接口交给外面，所以可以用假客户端整个测。

export type {
  LibraryClient,
  LibraryControllerOptions,
  PreviewHost,
  SystemActions,
} from "./controller-hosts.ts";

export class LibraryController {
  readonly #client: LibraryClient;
  readonly #clientId: string;
  #locale: Locale;
  readonly #preview: PreviewHost;
  readonly #system: SystemActions;
  readonly #home: string;
  readonly #now: () => number;
  readonly #timeline = new StartTimeline();
  #libraryRoot = "";
  readonly #listeners = new Set<(state: LibraryState) => void>();
  readonly #busy = new Set<string>();
  #playgrounds: Playground[] = [];
  #runs: RunSnapshot[] = [];
  #templates: TemplateRecord[] = [];
  readonly #workspace = new WorkspaceTabs();
  #closeRequestId: string | null = null;
  readonly #console: ConsoleLogs;
  #error: DesktopError | null = null;
  /** 启动请求失败时的错误（带缺工具的参数）；再次启动时清掉 */
  readonly #startErrors = new Map<string, DesktopError>();
  /** 崩溃前截下的预览最后一帧 */
  readonly #lastFrames = new Map<string, string>();
  #refreshing: Promise<void> | undefined;
  #refreshAgain = false;

  constructor(options: LibraryControllerOptions) {
    this.#client = options.client;
    this.#clientId = options.clientId;
    this.#locale = options.locale;
    this.#preview = options.preview;
    this.#system = options.system;
    this.#home = options.home;
    this.#now = options.now ?? Date.now;
    this.#console = new ConsoleLogs(options.client);
  }

  /** 订阅管理进程的事件并读第一份数据 */
  async start(): Promise<void> {
    this.#libraryRoot = await readLibraryRoot(this.#client, this.#home);
    try {
      await this.#client.subscribe(["run", "playground"], () => {
        void this.refresh();
      });
    } catch (error) {
      this.#error = toDesktopError(error);
    }
    await this.refresh();
  }

  /** 设置页改了语言或资源库位置：按新的重读、推给界面；旧位置的文件一个不碰（规格 DESKTOP-SETTINGS-03、06） */
  setLocale(locale: Locale): void {
    this.#locale = locale;
    this.#emit();
  }

  async reloadLibraryRoot(): Promise<void> {
    this.#libraryRoot = await readLibraryRoot(this.#client, this.#home);
    await this.refresh();
  }

  getState(): LibraryState {
    return buildLibraryState({
      locale: this.#locale,
      playgrounds: this.#playgrounds,
      runs: this.#runs,
      templates: this.#templates,
      tabIds: this.#workspace.tabs,
      activeTab: this.#workspace.active,
      busyIds: this.#busy,
      closeRequestId: this.#closeRequestId,
      error: this.#error,
      libraryRoot: this.#libraryRoot,
      startErrors: this.#startErrors,
      lastFrames: this.#lastFrames,
      home: this.#home,
      phases: (id) => this.#timeline.phases(id),
    });
  }

  onChange(listener: (state: LibraryState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 重读全部数据。并发的调用合并：正在读时再来请求，读完后补读一次 */
  refresh(): Promise<void> {
    if (this.#refreshing !== undefined) {
      this.#refreshAgain = true;
      return this.#refreshing;
    }
    const reading = (async () => {
      do {
        this.#refreshAgain = false;
        await this.#readAll();
      } while (this.#refreshAgain);
    })().finally(() => {
      this.#refreshing = undefined;
    });
    this.#refreshing = reading;
    return reading;
  }

  /**
   * 打开项目（规格 DESKTOP-WORKSPACE-01、02）：新开标签并启动运行；
   * 已经有它的标签就只切过去，不再启动。
   */
  async openProject(playgroundId: string): Promise<void> {
    const isNew = this.#workspace.open(playgroundId);
    this.#applyPreview();
    this.#emit();
    if (isNew) {
      // 先接上控制台再启动：安装和启动阶段的输出也要看得到（规格 DESKTOP-WORKSPACE-16）
      await this.#console.watch(playgroundId);
      await this.startRun(playgroundId);
    }
  }

  /** 这个项目标签页的控制台已有的全部输出（界面挂载时先取这份，再接后面的推送） */
  consoleLines(playgroundId: string): ConsoleLine[] {
    return this.#console.lines(playgroundId);
  }

  onConsole(listener: (append: ConsoleAppend) => void): () => void {
    return this.#console.onAppend(listener);
  }

  /** 启动（或标签页里点“运行”再次启动）；持有者始终是这个项目的标签页 */
  async startRun(playgroundId: string): Promise<void> {
    this.#startErrors.delete(playgroundId);
    this.#lastFrames.delete(playgroundId);
    const kind = this.#playgrounds.find((playground) => playground.id === playgroundId)?.kind;
    await this.#act(playgroundId, async () => {
      // 标签页持有者：这个项目在本应用里的“标签页”就是它自己，运行随本连接的生死
      const starting = this.#client.call("run.start", {
        playground: playgroundId,
        owner: { kind: "tab", clientId: this.#clientId, tabId: `tab-${playgroundId}` },
        // 服务等到就绪或失败：失败时错误响应带参数（缺哪个工具、模板写的安装命令），
        // 运行状态里只有错误码。脚本没有就绪，它的失败只看状态
        wait: kind === "oneshot" ? "none" : "ready",
      });
      if (kind === "oneshot") {
        await starting;
        return;
      }
      // 不等到就绪：运行条要立刻能点“停止”。立刻就有的错误（项目不见了等）赶得上这一轮，
      // 之后才到的错误由 #startSettled 记下
      const settled = starting.then(
        () => this.#startSettled(playgroundId),
        (error: unknown) => this.#startSettled(playgroundId, error),
      );
      await Promise.race([settled, new Promise<void>((resolve) => setTimeout(resolve, 0))]);
    });
  }

  // 启动请求有了结果：失败的原因留给预览区的专门画面，其余错误照旧报在 error 里
  async #startSettled(playgroundId: string, error?: unknown): Promise<void> {
    const outcome = error === undefined ? null : classifyStartError(error);
    if (outcome?.kind === "failure") this.#startErrors.set(playgroundId, outcome.error);
    else if (outcome?.kind === "other") this.#error = outcome.error;
    await this.refresh();
  }

  async stopRun(playgroundId: string): Promise<void> {
    await this.#act(playgroundId, async () => {
      await this.#client.call("run.stop", { playground: playgroundId });
    });
  }

  /**
   * 关闭项目标签（规格 DESKTOP-WORKSPACE-04、06、09、10）：只有“标签页持有、仍在进行”的运行
   * 才需要确认，而且用户没勾过“不再提示”；已停止的和命令行持有的直接关。
   */
  async requestCloseTab(playgroundId: string): Promise<void> {
    if (!this.#workspace.tabs.includes(playgroundId)) return;
    if (ownedActiveRun(playgroundId, this.#runs) === null) {
      await this.#closeNow(playgroundId);
      return;
    }
    if (!(await readConfirmClose(this.#client))) {
      await this.#closeNow(playgroundId);
      return;
    }
    this.#closeRequestId = playgroundId;
    this.#emit();
  }

  /** 确认关闭并停止；勾了“不再提示”就先记下（失败只报错，不拦着关） */
  async confirmClose(playgroundId: string, dontAskAgain: boolean): Promise<void> {
    if (this.#closeRequestId !== playgroundId) return;
    this.#closeRequestId = null;
    if (dontAskAgain) {
      try {
        await this.#client.call("settings.set", { confirmCloseRunningTab: false });
      } catch (error) {
        this.#error = toDesktopError(error);
      }
    }
    await this.#closeNow(playgroundId);
  }

  /** 取消：弹窗关掉，标签和运行都不动，勾选也不记 */
  cancelClose(): void {
    if (this.#closeRequestId === null) return;
    this.#closeRequestId = null;
    this.#emit();
  }

  // 先把标签去掉（界面立刻响应），再停它持有的运行；停止的时限由管理进程保证（run/ownership）
  async #closeNow(playgroundId: string): Promise<void> {
    const owned = needsStopOnClose(playgroundId, this.#runs);
    if (!this.#workspace.close(playgroundId)) return;
    this.#preview.release(playgroundId);
    this.#console.unwatch(playgroundId);
    this.#startErrors.delete(playgroundId);
    this.#lastFrames.delete(playgroundId);
    this.#applyPreview();
    this.#emit();
    if (owned) {
      try {
        await this.#client.call("run.stop", { playground: playgroundId });
      } catch (error) {
        this.#error = toDesktopError(error);
      }
    }
    await this.refresh();
  }

  /** 更多菜单“在访达中显示”：路径取管理进程给的那份，界面只报项目 id */
  revealFolder(playgroundId: string): void {
    const path = this.folderOf(playgroundId);
    if (path !== null) this.#system.revealInFileManager(path);
  }

  /** 更多菜单“复制路径”：把项目文件夹的绝对路径放进剪贴板 */
  copyFolderPath(playgroundId: string): void {
    const path = this.folderOf(playgroundId);
    if (path !== null) this.#system.copyText(path);
  }

  /** 缺工具画面的“复制命令”：只放进剪贴板，从不执行 */
  copyText(text: string): void {
    this.#system.copyText(text);
  }

  /** 安装说明的官网：只放行 https（链接来自模板或工具定义，不可全信） */
  openLink(url: string): void {
    if (/^https:\/\/\S+$/.test(url)) this.#system.openExternal(url);
  }

  /** 项目文件夹的绝对路径；没有这个项目是 null */
  folderOf(playgroundId: string): string | null {
    return this.#playgrounds.find((playground) => playground.id === playgroundId)?.path ?? null;
  }

  selectTab(id: string): void {
    this.#workspace.select(id);
    this.#applyPreview();
    this.#emit();
  }

  /** 新建弹窗的“创建并运行”（规格 DESKTOP-CREATE-FLOW-11）：创建失败原样交回弹窗，不动全局错误；运行失败不算创建失败 */
  async create(request: CreateRequest): Promise<CreateResult> {
    const began = this.#now();
    const created = await createPlayground(this.#client, request);
    if (!created.ok) return created;
    const id = created.id;
    this.#timeline.noteCopy(id, this.#now() - began);
    await this.refresh();
    await this.openProject(id);
    return { ok: true };
  }

  async #act(busyId: string | undefined, action: () => Promise<void>): Promise<void> {
    if (busyId !== undefined) {
      if (this.#busy.has(busyId)) return;
      this.#busy.add(busyId);
    }
    this.#error = null;
    this.#emit();
    try {
      await action();
    } catch (error) {
      this.#error = toDesktopError(error);
    } finally {
      if (busyId !== undefined) this.#busy.delete(busyId);
    }
    await this.refresh();
  }

  async #readAll(): Promise<void> {
    try {
      const [playgrounds, runs, templates] = await Promise.all([
        this.#client.call("playground.list", {}),
        this.#client.call("run.list", {}),
        this.#client.call("template.list", {}),
      ]);
      await this.#keepLastFrame(runs);
      this.#timeline.observe(latestRunByPlayground(runs), this.#now());
      this.#playgrounds = playgrounds;
      this.#runs = runs;
      this.#templates = templates;
      const removed = this.#workspace.retain(
        new Set(playgrounds.map((playground) => playground.id)),
      );
      for (const id of removed) {
        this.#timeline.forget(id);
        this.#startErrors.delete(id);
        this.#lastFrames.delete(id);
        this.#preview.release(id);
        this.#console.unwatch(id);
      }
      if (this.#closeRequestId !== null && !this.#workspace.tabs.includes(this.#closeRequestId)) {
        this.#closeRequestId = null;
      }
    } catch (error) {
      this.#error = toDesktopError(error);
    }
    this.#applyPreview();
    this.#emit();
  }

  async #keepLastFrame(next: readonly RunSnapshot[]): Promise<void> {
    const active = this.#workspace.active;
    if (active === LIBRARY_TAB) return;
    const frame = await frameBeforeCrash(this.#preview, active, this.#runs, next);
    if (frame !== null) this.#lastFrames.set(active, frame);
  }

  setPreviewBounds(bounds: Bounds | null): void {
    this.#preview.setBounds(bounds);
  }

  capturePreview(): Promise<string | null> {
    return this.#preview.capture();
  }

  setPreviewVisible(visible: boolean): void {
    this.#preview.setVisible(visible);
  }

  #applyPreview(): void {
    // 预览跟着当前标签走：资源库标签不显示预览（视图留着，回来即见）。
    // 项目标签页面没就绪（启动中、已停止、崩溃）就销毁视图：旧页面已经没了，界面显示占位区
    const active = this.#workspace.active;
    if (active === LIBRARY_TAB) {
      this.#preview.hide();
      return;
    }
    const url = previewUrlFor(active, this.#runs);
    if (url !== null) this.#preview.show(active, url);
    else this.#preview.release(active);
  }

  #emit(): void {
    const state = this.getState();
    for (const listener of this.#listeners) listener(state);
  }
}
