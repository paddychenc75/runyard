import type { Locale } from "@runyard/i18n";
import type { Playground, RunSnapshot, TemplateRecord } from "@runyard/protocol";
import type { ConsoleAppend, ConsoleLine } from "../shared/console-state.ts";
import type { CreateRequest, CreateResult } from "../shared/desktop-bridge.ts";
import type { Bounds } from "../shared/layout.ts";
import type { DesktopError, LibraryState } from "../shared/library-state.ts";
import {
  buildLibraryState,
  isActiveRun,
  latestRunByPlayground,
  previewUrlFor,
} from "./build-library-state.ts";
import { CliView, heldByCli } from "./cli-view.ts";
import { ConsoleLogs } from "./console-logs.ts";
import type { LibraryClient, LibraryControllerOptions, PreviewHost } from "./controller-hosts.ts";
import { createPlayground } from "./create-playground.ts";
import { toDesktopError } from "./desktop-error.ts";
import { frameBeforeCrash } from "./last-frame.ts";
import { readLibraryRoot } from "./library-root.ts";
import { PlaygroundEdits } from "./playground-edits.ts";
import { ProjectSystem } from "./project-system.ts";
import { RunActions } from "./run-actions.ts";
import { SessionTracker } from "./session-tracker.ts";
import { StartTimeline } from "./start-timeline.ts";
import { TabClose } from "./tab-close.ts";
import { LIBRARY_TAB, WorkspaceTabs } from "./workspace-tabs.ts";

// 窗口背后的逻辑：向管理进程要项目、模板、运行，转成界面看的状态；执行界面发来的动作。
// 不认识 Electron：预览通过 PreviewHost 这个接口交给外面，所以可以用假客户端整个测。

export type { LibraryClient, PreviewHost, SystemActions } from "./controller-hosts.ts";

export class LibraryController {
  readonly #client: LibraryClient;
  #locale: Locale;
  readonly #preview: PreviewHost;
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
  readonly #session: SessionTracker;
  readonly #cliView: CliView;
  /** 恢复出来但还没启动的标签页：切过去才启动（规格 DESKTOP-WORKSPACE-52） */
  readonly #pendingStart = new Set<string>();
  #loaded = false;
  readonly #close: TabClose;
  readonly #runActions: RunActions;
  readonly #console: ConsoleLogs;
  #error: DesktopError | null = null;
  readonly #startErrors = new Map<string, DesktopError>();
  readonly #lastFrames = new Map<string, string>();
  readonly edits: PlaygroundEdits;
  readonly system: ProjectSystem;
  #refreshing: Promise<void> | undefined;
  #refreshAgain = false;
  constructor(options: LibraryControllerOptions) {
    this.#client = options.client;
    this.#locale = options.locale;
    this.#preview = options.preview;
    this.#home = options.home;
    this.#now = options.now ?? Date.now;
    const setError = (error: DesktopError | null): void => {
      this.#error = error;
    };
    this.#session = new SessionTracker(options.session);
    this.#cliView = new CliView(options.client, options.clientId);
    this.#runActions = new RunActions(
      {
        client: options.client,
        clientId: options.clientId,
        kindOf: (id) => this.#playgrounds.find((playground) => playground.id === id)?.kind,
        busy: this.#busy,
        startErrors: this.#startErrors,
        lastFrames: this.#lastFrames,
        setError,
        emit: () => this.#emit(),
        refresh: () => this.refresh(),
      },
      this.#cliView,
    );
    this.#close = new TabClose({
      client: options.client,
      hasTab: (id) => this.#workspace.tabs.includes(id),
      runs: () => this.#runs,
      dropTab: (id) => this.#dropTab(id),
      refresh: () => this.refresh(),
      emit: () => this.#emit(),
      fail: setError,
    });
    this.#console = new ConsoleLogs(options.client);
    this.system = new ProjectSystem(options.system, (id) => this.folderOf(id));
    this.edits = new PlaygroundEdits(options.client, {
      busy: this.#busy,
      emit: () => this.#emit(),
      refresh: () => this.refresh(),
      current: (id) => this.#playgrounds.find((playground) => playground.id === id),
      dropTab: (id) => void this.#dropTab(id),
      chooseFolder: (defaultPath) => options.system.chooseFolder(defaultPath),
      folderOf: (id) => this.folderOf(id),
    });
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
    await this.#restore();
  }

  /** 退出开始：之后不再覆盖已记下的标签页 */
  freezeSession(): void {
    this.#session.freeze();
  }

  // 恢复上次的标签页（规格 DESKTOP-WORKSPACE-51 至 54）：只启动当前显示的那个；
  // 已被命令行运行起来的是查看画面，不另启动
  async #restore(): Promise<void> {
    const known = new Set(this.#playgrounds.map((playground) => playground.id));
    const plan = this.#loaded ? await this.#session.plan(known) : null;
    if (plan !== null) {
      for (const id of plan.tabs) {
        this.#workspace.open(id);
        await this.#console.watch(id);
      }
      this.#workspace.select(plan.active);
      for (const id of plan.pending) this.#pendingStart.add(id);
      await this.#cliView.sync(this.#workspace.tabs, this.#runs);
      await this.#startIfPending(this.#workspace.active);
      this.#applyPreview();
    }
    this.#session.open();
    this.#emit();
  }

  // 恢复出来没启动的标签页被切到才启动；已有进行中的运行（命令行启动的）就不再启动
  async #startIfPending(id: string): Promise<void> {
    if (!this.#pendingStart.delete(id)) return;
    const run = latestRunByPlayground(this.#runs).get(id);
    if (run === undefined || !isActiveRun(run.state)) await this.startRun(id);
  }

  /** 设置页改了语言或资源库位置：按新的重读、推给界面；旧位置的文件一个不碰（规格 DESKTOP-SETTINGS-03、06） */
  async applySettings(locale: Locale): Promise<void> {
    this.#locale = locale;
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
      closeRequestId: this.#close.requestId,
      error: this.#error,
      libraryRoot: this.#libraryRoot,
      startErrors: this.#startErrors,
      lastFrames: this.#lastFrames,
      home: this.#home,
      phases: (id) => this.#timeline.phases(id),
      loaded: this.#loaded,
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
      // 命令行已经在运行它：只查看，不启动，持有者仍是命令行（规格 DESKTOP-WORKSPACE-46、48）
      if (heldByCli(playgroundId, this.#runs) !== null) {
        await this.#cliView.sync(this.#workspace.tabs, this.#runs);
        return;
      }
      await this.startRun(playgroundId);
    }
  }

  /** “改为由我管理”（规格 DESKTOP-WORKSPACE-49） */
  async adoptRun(playgroundId: string): Promise<void> {
    const held = heldByCli(playgroundId, this.#runs);
    if (held !== null) await this.#runActions.adopt(held);
  }

  /** 运行视图的“全部停止”（规格 DESKTOP-WORKSPACE-45） */
  stopAll = (): Promise<void> => this.#runActions.stopAll();

  /** “打开但不运行”（规格 DESKTOP-LIBRARY-VIEW-33）：已停止的只开标签页、不算一次使用；运行中的同“打开” */
  async openProjectWithoutRun(playgroundId: string): Promise<void> {
    const run = latestRunByPlayground(this.#runs).get(playgroundId);
    if (run !== undefined && isActiveRun(run.state)) {
      await this.openProject(playgroundId);
      return;
    }
    const isNew = this.#workspace.open(playgroundId);
    this.#applyPreview();
    this.#emit();
    if (isNew) await this.#console.watch(playgroundId);
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
    this.#pendingStart.delete(playgroundId);
    await this.#runActions.start(playgroundId);
  }

  stopRun = (playgroundId: string): Promise<void> => this.#runActions.stop(playgroundId);

  requestCloseTab = (id: string): Promise<void> => this.#close.request(id);
  confirmClose = (id: string, dontAskAgain: boolean): Promise<void> =>
    this.#close.confirm(id, dontAskAgain);
  cancelClose = (): void => this.#close.cancel();

  /** 去掉标签并放掉预览和控制台，不碰运行 */
  #dropTab(playgroundId: string): boolean {
    if (!this.#workspace.close(playgroundId)) return false;
    this.#dropProject(playgroundId);
    this.#applyPreview();
    this.#emit();
    return true;
  }

  // 标签关掉或项目没了：预览、控制台和它留下的失败记录都放掉
  #dropProject(id: string): void {
    this.#preview.release(id);
    this.#console.unwatch(id);
    this.#startErrors.delete(id);
    this.#lastFrames.delete(id);
    this.#pendingStart.delete(id);
    this.#cliView.forget(id);
  }

  folderOf(playgroundId: string): string | null {
    return this.#playgrounds.find((playground) => playground.id === playgroundId)?.path ?? null;
  }

  selectTab(id: string): void {
    this.#workspace.select(id);
    this.#applyPreview();
    this.#emit();
    void this.#startIfPending(id);
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
      this.#loaded = true;
      const removed = this.#workspace.retain(
        new Set(playgrounds.map((playground) => playground.id)),
      );
      for (const id of removed) {
        this.#timeline.forget(id);
        this.#dropProject(id);
      }
      const requested = this.#close.requestId;
      if (requested !== null && !this.#workspace.tabs.includes(requested))
        this.#close.requestId = null;
    } catch (error) {
      this.#error = toDesktopError(error);
    }
    // 命令行刚启动了某个已打开标签页的项目：它就成了查看画面（规格 DESKTOP-WORKSPACE-54）
    await this.#cliView.sync(this.#workspace.tabs, this.#runs);
    for (const id of [...this.#pendingStart]) {
      const run = latestRunByPlayground(this.#runs).get(id);
      if (run !== undefined && isActiveRun(run.state)) this.#pendingStart.delete(id);
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
    // 标签页一变就记下；没启动的恢复标签页仍算“上次在运行”
    this.#session.record({
      tabs: state.tabs.map((tab) => ({
        id: tab.id,
        running: tab.active || this.#pendingStart.has(tab.id),
      })),
      active: state.activeTab,
    });
  }
}
