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
  previewUrlForTab,
} from "./build-library-state.ts";
import { CliView, heldByCli } from "./cli-view.ts";
import { Coalesced } from "./coalesced.ts";
import { ConsoleLogs } from "./console-logs.ts";
import type { LibraryClient, LibraryControllerOptions, PreviewHost } from "./controller-hosts.ts";
import { createPlayground } from "./create-playground.ts";
import { toDesktopError } from "./desktop-error.ts";
import { frameBeforeCrash } from "./last-frame.ts";
import { LibraryChrome } from "./library-chrome.ts";
import { PlaygroundEdits } from "./playground-edits.ts";
import { ProjectOpening } from "./project-opening.ts";
import { ProjectPresence } from "./project-presence.ts";
import { ProjectRelease } from "./project-release.ts";
import { ProjectSystem } from "./project-system.ts";
import { RunActions } from "./run-actions.ts";
import { RunBarActions } from "./run-bar-actions.ts";
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
  readonly chrome: LibraryChrome;
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
  readonly #release: ProjectRelease;
  readonly #runActions: RunActions;
  readonly #console: ConsoleLogs;
  #error: DesktopError | null = null;
  readonly #startErrors = new Map<string, DesktopError>();
  readonly #lastFrames = new Map<string, string>();
  readonly edits: PlaygroundEdits;
  readonly system: ProjectSystem;
  readonly runBar: RunBarActions;
  readonly #presence: ProjectPresence;
  readonly #opening: ProjectOpening;
  readonly #reading = new Coalesced(() => this.#readAll());
  constructor(options: LibraryControllerOptions) {
    this.#client = options.client;
    this.#locale = options.locale;
    this.#preview = options.preview;
    this.#home = options.home;
    this.#now = options.now ?? Date.now;
    this.#release = new ProjectRelease(options.client, options.terminals, (id) =>
      this.folderOf(id),
    );
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
      terminalCommand: (id) => this.#release.runningCommand(id),
    });
    this.#console = new ConsoleLogs(options.client);
    this.#presence = new ProjectPresence(
      () => this.#playgrounds,
      options.system.directoryExists,
      async () => {
        await this.#client.call("library.rescan", {});
        await this.refresh();
      },
    );
    this.#opening = new ProjectOpening({
      present: async (id) => (await this.checkProjectFolders(id)) && !this.#isMissing(id),
      markOpened: (id) => this.edits.markOpened(id),
      workspace: this.#workspace,
      show: () => {
        this.#applyPreview();
        this.#emit();
      },
      runs: () => this.#runs,
      cliView: this.#cliView,
      console: this.#console,
      start: (id) => this.startRun(id),
    });
    this.system = new ProjectSystem(options.system, (id) => this.folderOf(id));
    this.chrome = new LibraryChrome(options, {
      refresh: () => this.refresh(),
      emit: () => this.#emit(),
      setError,
      trash: (id) => this.edits.trash(id),
    });
    this.edits = new PlaygroundEdits(options.client, {
      busy: this.#busy,
      emit: () => this.#emit(),
      refresh: () => this.refresh(),
      current: (id) => this.#playgrounds.find((playground) => playground.id === id),
      dropTab: (id) => void this.#dropTab(id),
      chooseFolder: (defaultPath) => options.system.chooseFolder(defaultPath),
      folderOf: (id) => this.folderOf(id),
      flushProject: (id) => this.#release.flush(id),
      releaseProject: (id, reason) => this.#release.release(id, reason),
      restoreProject: (id) => this.#release.restore(id),
    });
    this.runBar = new RunBarActions({
      ...options,
      console: this.#console,
      runs: () => this.#runs,
      act: (id, action) => this.#runActions.act(id, action),
    });
  }

  /** 放掉终端以外的句柄（编辑器的文件监听）；比控制器晚建，所以事后接 */
  onProjectRelease = (release: Parameters<ProjectRelease["onExtras"]>[0]): void =>
    this.#release.onExtras(release);

  /** 订阅管理进程的事件并读第一份数据 */
  async start(): Promise<void> {
    await this.chrome.readRoot();
    try {
      await this.#client.subscribe(["run", "playground"], (event) =>
        this.#release.onEvent(event, () => this.refresh()),
      );
    } catch (error) {
      this.#error = toDesktopError(error);
    }
    // 文件夹被挪走了要在列表里看得到：先让管理进程扫一遍（规格 DESKTOP-LIBRARY-VIEW-49）；扫不了不影响打开
    await this.#client.call("library.rescan", {}).catch(() => undefined);
    await this.refresh();
    await this.#restore();
  }

  /** 退出开始：之后不再覆盖已记下的标签页 */
  freezeSession = (): void => this.#session.freeze();

  // 恢复上次的标签页（规格 DESKTOP-WORKSPACE-51 至 54）：只启动当前显示的那个；
  // 已被命令行运行起来的是查看画面，不另启动
  async #restore(): Promise<void> {
    const known = new Set(this.#playgrounds.map((playground) => playground.id));
    const plan = this.#loaded ? await this.#session.plan(known) : null;
    if (plan !== null) await this.#opening.restore(plan, this.#pendingStart);
    this.#applyPreview();
    this.#session.open();
    this.#emit();
  }

  // 恢复出来没启动的标签页被切到才启动；已有进行中的运行（命令行启动的）就不再启动
  #startIfPending = (id: string): Promise<void> =>
    this.#opening.startPending(id, this.#pendingStart);

  /** 设置页改了语言或资源库位置：按新的重读、推给界面；旧位置的文件一个不碰（规格 DESKTOP-SETTINGS-03、06） */
  async applySettings(locale: Locale): Promise<void> {
    this.#locale = locale;
    await this.chrome.readRoot();
    await this.refresh();
  }

  getState(): LibraryState {
    return {
      ...buildLibraryState({
        locale: this.#locale,
        playgrounds: this.#playgrounds,
        runs: this.#runs,
        templates: this.#templates,
        tabIds: this.#workspace.tabs,
        activeTab: this.#workspace.active,
        busyIds: this.#busy,
        closeRequestId: this.#close.requestId,
        closeTerminal: this.#close.requestTerminal,
        error: this.#error,
        ...this.chrome.inputs(),
        startErrors: this.#startErrors,
        lastFrames: this.#lastFrames,
        home: this.#home,
        phases: (id) => this.#timeline.phases(id),
        loaded: this.#loaded,
      }),
      libraryReveal: this.#opening.reveal,
    };
  }

  onChange(listener: (state: LibraryState) => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  /** 重读全部数据。并发的调用合并：正在读时再来请求，读完后补读一次 */
  refresh = (): Promise<void> => this.#reading.run();

  /** 普通打开的路径守卫与运行规则由 ProjectOpening 共用。 */
  openProject = (id: string): Promise<void> => this.#opening.open(id);

  /** “改为由我管理”（规格 DESKTOP-WORKSPACE-49） */
  async adoptRun(playgroundId: string): Promise<void> {
    const held = heldByCli(playgroundId, this.#runs);
    if (held !== null) await this.#runActions.adopt(held);
  }

  /** 运行视图的“全部停止”（规格 DESKTOP-WORKSPACE-45） */
  stopAll = (): Promise<void> => this.#runActions.stopAll();

  /** “打开但不运行”（规格 DESKTOP-LIBRARY-VIEW-33）：已停止的只开标签页、不算一次使用；运行中的同“打开” */
  openProjectWithoutRun = (id: string): Promise<void> => this.#opening.open(id, true);

  /** 这个项目标签页的控制台已有的全部输出（界面挂载时先取这份，再接后面的推送） */
  consoleLines = (playgroundId: string): ConsoleLine[] => this.#console.lines(playgroundId);

  onConsole = (listener: (append: ConsoleAppend) => void): (() => void) =>
    this.#console.onAppend(listener);

  /** 启动（或标签页里点“运行”再次启动）；持有者始终是这个项目的标签页 */
  async startRun(playgroundId: string): Promise<void> {
    this.#pendingStart.delete(playgroundId);
    if (!(await this.checkProjectFolders(playgroundId)) || this.#isMissing(playgroundId)) return;
    await this.#runActions.start(playgroundId);
  }

  async checkProjectFolders(id?: string): Promise<boolean> {
    try {
      await this.#presence.check(id);
      return true;
    } catch (error) {
      this.#error = toDesktopError(error);
      this.#emit();
      return false;
    }
  }

  #isMissing = (id: string): boolean =>
    this.#playgrounds.find((playground) => playground.id === id)?.missingSince !== undefined;

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
    this.#release.tabClosed(id);
  }

  folderOf = (id: string): string | null =>
    this.#playgrounds.find((playground) => playground.id === id)?.path ?? null;

  async selectTab(id: string): Promise<void> {
    this.#opening.beginNavigation();
    this.#workspace.select(id);
    this.#applyPreview();
    this.#emit();
    await this.#startIfPending(id);
  }

  /** 新建弹窗的“创建并运行”（规格 DESKTOP-CREATE-FLOW-11）：创建失败原样交回弹窗，不动全局错误；运行失败不算创建失败 */
  async create(request: CreateRequest): Promise<CreateResult> {
    const began = this.#now();
    const created = await createPlayground(this.#client, request);
    if (!created.ok) return created;
    const id = created.id;
    this.#timeline.noteCopy(id, this.#now() - began);
    this.chrome.created(created.name, created.notices);
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
      const active = this.#workspace.active;
      const frame =
        active === LIBRARY_TAB
          ? null
          : await frameBeforeCrash(this.#preview, active, this.#runs, runs);
      if (frame !== null) this.#lastFrames.set(active, frame);
      this.#timeline.observe(latestRunByPlayground(runs), this.#now());
      this.#playgrounds = playgrounds;
      this.#runs = runs;
      this.chrome.observe(playgrounds, runs);
      this.#templates = templates;
      this.#loaded = true;
      const removed = this.#workspace.retain(
        new Set(playgrounds.map((playground) => playground.id)),
      );
      for (const id of removed) {
        this.#timeline.forget(id);
        this.#dropProject(id);
      }
      // 请求关闭的标签页已经不在了：撤掉请求（没有请求时 requestId 本来就是 null）
      if (!this.#workspace.tabs.includes(this.#close.requestId ?? "")) this.#close.requestId = null;
    } catch (error) {
      this.#error = toDesktopError(error);
    }
    await this.#console.syncRuns(latestRunByPlayground(this.#runs), this.#workspace.tabs);
    // 命令行刚启动了某个已打开标签页的项目：它就成了查看画面（规格 DESKTOP-WORKSPACE-54）
    await this.#cliView.sync(this.#workspace.tabs, this.#runs);
    for (const id of [...this.#pendingStart]) {
      const run = latestRunByPlayground(this.#runs).get(id);
      if (run !== undefined && isActiveRun(run.state)) this.#pendingStart.delete(id);
    }
    this.#applyPreview();
    this.#emit();
  }

  setPreviewBounds = (bounds: Bounds | null): void => this.#preview.setBounds(bounds);
  capturePreview = (): Promise<string | null> => this.#preview.capture();
  setPreviewVisible = (visible: boolean): void => this.#preview.setVisible(visible);

  #applyPreview(): void {
    // 预览跟着当前标签走：资源库标签不显示预览（视图留着，回来即见）。
    // 项目标签页面没就绪（启动中、已停止、崩溃）就销毁视图：旧页面已经没了，界面显示占位区
    const active = this.#workspace.active;
    if (active === LIBRARY_TAB) {
      this.#preview.hide();
      return;
    }
    const url = previewUrlForTab(this.getState().tabs, active, this.#runs);
    if (url !== null) this.#preview.show(active, url);
    else this.#preview.release(active);
  }

  #emit(): void {
    const state = this.getState();
    this.chrome.publish(state);
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
