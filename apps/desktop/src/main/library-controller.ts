import { isClientError, type RunyardClient } from "@runyard/client";
import type { Locale } from "@runyard/i18n";
import type { Playground, RunSnapshot, TemplateRecord } from "@runyard/protocol";
import type { DesktopError, LibraryState } from "../shared/library-state.ts";
import { buildLibraryState, previewUrlFor } from "./build-library-state.ts";
import { LIBRARY_TAB, WorkspaceTabs } from "./workspace-tabs.ts";

// 窗口背后的逻辑：向管理进程要项目、模板、运行，转成界面看的状态；执行界面发来的动作。
// 不认识 Electron：预览通过 PreviewHost 这个接口交给外面，所以可以用假客户端整个测。

/** 预览视图的宿主。同一个项目、同一个地址再次 show 时应当什么都不做 */
export interface PreviewHost {
  show(playgroundId: string, url: string): void;
  hide(): void;
}

/** 控制器用到的客户端的那一小部分 */
export type LibraryClient = Pick<RunyardClient, "call" | "subscribe">;

export interface LibraryControllerOptions {
  client: LibraryClient;
  /** 这个应用实例的连接标识；标签页持有者靠它绑定到本连接（PRD #prd-run-ownership） */
  clientId: string;
  locale: Locale;
  preview: PreviewHost;
}

export class LibraryController {
  readonly #client: LibraryClient;
  readonly #clientId: string;
  readonly #locale: Locale;
  readonly #preview: PreviewHost;
  readonly #listeners = new Set<(state: LibraryState) => void>();
  readonly #busy = new Set<string>();
  #playgrounds: Playground[] = [];
  #runs: RunSnapshot[] = [];
  #templates: TemplateRecord[] = [];
  readonly #workspace = new WorkspaceTabs();
  #error: DesktopError | null = null;
  #refreshing: Promise<void> | undefined;
  #refreshAgain = false;

  constructor(options: LibraryControllerOptions) {
    this.#client = options.client;
    this.#clientId = options.clientId;
    this.#locale = options.locale;
    this.#preview = options.preview;
  }

  /** 订阅管理进程的事件并读第一份数据 */
  async start(): Promise<void> {
    try {
      await this.#client.subscribe(["run", "playground"], () => {
        void this.refresh();
      });
    } catch (error) {
      this.#fail(error);
    }
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
      error: this.#error,
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
    if (isNew) await this.startRun(playgroundId);
  }

  /** 启动（或标签页里点“运行”再次启动）；持有者始终是这个项目的标签页 */
  async startRun(playgroundId: string): Promise<void> {
    await this.#act(playgroundId, async () => {
      // 标签页持有者：这个项目在本应用里的“标签页”就是它自己，运行随本连接的生死
      await this.#client.call("run.start", {
        playground: playgroundId,
        owner: { kind: "tab", clientId: this.#clientId, tabId: `tab-${playgroundId}` },
        wait: "none",
      });
    });
  }

  async stopRun(playgroundId: string): Promise<void> {
    await this.#act(playgroundId, async () => {
      await this.#client.call("run.stop", { playground: playgroundId });
    });
  }

  selectTab(id: string): void {
    this.#workspace.select(id);
    this.#applyPreview();
    this.#emit();
  }

  async create(templateId: string): Promise<void> {
    await this.#act(undefined, async () => {
      await this.#client.call("playground.create", {
        template: templateId,
        createdBy: { kind: "user" },
      });
    });
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
      this.#fail(error);
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
      this.#playgrounds = playgrounds;
      this.#runs = runs;
      this.#templates = templates;
      this.#workspace.retain(new Set(playgrounds.map((playground) => playground.id)));
    } catch (error) {
      this.#fail(error);
    }
    this.#applyPreview();
    this.#emit();
  }

  #applyPreview(): void {
    // 预览跟着当前标签走：资源库标签没有预览
    const active = this.#workspace.active;
    const url = active === LIBRARY_TAB ? null : previewUrlFor(active, this.#runs);
    if (url !== null) this.#preview.show(active, url);
    else this.#preview.hide();
  }

  #fail(error: unknown): void {
    const known = isClientError(error) ? error.known : undefined;
    this.#error =
      known === undefined
        ? { code: "INTERNAL", params: {} }
        : { code: known.code, params: known.params as Record<string, unknown> };
  }

  #emit(): void {
    const state = this.getState();
    for (const listener of this.#listeners) listener(state);
  }
}
