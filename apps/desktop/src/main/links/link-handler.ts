import type { CreateRequest, CreateResult } from "../../shared/desktop-bridge.ts";
import type {
  LinkConfirmView,
  LinkNoticeCode,
  PlaygroundRow,
  TemplateRow,
} from "../../shared/library-state.ts";
import { defaultName, nameProblem } from "../../shared/project-name.ts";
import { type ParsedLink, parseLink } from "./parse-link.ts";

// runyard:// 链接的处理（规格 desktop/links）：open 打开已有项目；new 每次都先确认，
// 来源只是链接自称的，没有“信任来源”。不认识 Electron：窗口、项目和提示都经 LinkHost 传进来。

/** 免确认的新建，两次之间至少隔这么久（规格 DESKTOP-LINKS-16） */
export const SKIP_CONFIRM_INTERVAL_MS = 5000;

export interface LinkHost {
  playgrounds(): readonly Pick<PlaygroundRow, "id" | "name">[];
  /** 本机能用的模板；category 为 mine 的是用户自己的 */
  templates(): readonly Pick<TemplateRow, "id" | "name" | "category">[];
  /** 资源库文件夹的显示写法（~/Runyard） */
  libraryRoot(): string;
  /** 把应用窗口带到前面 */
  focus(): void;
  /** 打开项目：已有标签页就切过去，没有就新开并运行 */
  openProject(id: string): Promise<void>;
  /** 新建并打开并运行，持有者是标签页 */
  create(request: CreateRequest): Promise<CreateResult>;
  skipConfirmForBuiltin(): Promise<boolean>;
  notify(code: LinkNoticeCode, value: string | null): void;
  /** 待确认请求变了（出现或消失） */
  pendingChanged(view: LinkConfirmView | null): void;
  now(): number;
}

interface Pending {
  view: LinkConfirmView;
  request: CreateRequest;
}

export class LinkHandler {
  readonly #host: LinkHost;
  #pending: Pending | null = null;
  #lastSkipAt = Number.NEGATIVE_INFINITY;

  constructor(host: LinkHost) {
    this.#host = host;
  }

  /** 收到一条链接；fromProject 是它从哪个项目的预览页里发出的（应用外点来的没有） */
  async handle(address: string, fromProject?: string): Promise<void> {
    const link = parseLink(address);
    if (link.kind === "open") return await this.#open(link.name);
    if (link.kind === "new") return await this.#new(link, fromProject);
    this.#host.notify(link.reason === "name" ? "open-invalid" : "link-invalid", null);
  }

  async #open(name: string): Promise<void> {
    const found = this.#host.playgrounds().find((playground) => playground.name === name);
    if (found === undefined) return this.#host.notify("open-missing", name);
    this.#host.focus();
    await this.#host.openProject(found.id);
  }

  async #new(link: Extract<ParsedLink, { kind: "new" }>, fromProject?: string): Promise<void> {
    // 已有一个确认框开着：后来的丢掉，不管它写的是什么
    if (this.#pending !== null) return this.#host.notify("new-busy", null);
    const template = this.#host.templates().find((candidate) => candidate.id === link.template);
    if (template === undefined) return this.#host.notify("new-no-template", link.template);
    const existing = this.#host.playgrounds().map((playground) => playground.name);
    if (link.name !== undefined) {
      const problem = nameProblem(link.name, existing);
      if (problem !== null) {
        return this.#host.notify(
          problem === "taken" ? "new-name-taken" : "new-name-invalid",
          link.name,
        );
      }
    }
    const name = link.name ?? defaultName(template.id, existing);
    const request: CreateRequest = {
      template: template.id,
      name,
      note: link.note ?? "",
      autoClean: link.cleanAfter ?? null,
    };
    if (template.category !== "mine" && (await this.#host.skipConfirmForBuiltin())) {
      const now = this.#host.now();
      if (now - this.#lastSkipAt < SKIP_CONFIRM_INTERVAL_MS)
        return this.#host.notify("new-throttled", null);
      this.#lastSkipAt = now;
      this.#host.focus();
      return await this.#run(request);
    }
    const fromName =
      fromProject === undefined
        ? null
        : (this.#host.playgrounds().find((p) => p.id === fromProject)?.name ?? null);
    const view: LinkConfirmView = {
      source: link.source ?? null,
      fromProject: fromName,
      template: { id: template.id, name: template.name },
      name,
      folder: `${this.#host.libraryRoot()}/${name}`,
    };
    this.#pending = { view, request };
    this.#host.focus();
    this.#host.pendingChanged(view);
  }

  /** 确认框的“新建并运行” */
  async confirm(): Promise<void> {
    const pending = this.#pending;
    if (pending === null) return;
    this.#pending = null;
    this.#host.pendingChanged(null);
    await this.#run(pending.request);
  }

  /** 确认框的“取消”、回车、Esc */
  cancel(): void {
    if (this.#pending === null) return;
    this.#pending = null;
    this.#host.pendingChanged(null);
  }

  async #run(request: CreateRequest): Promise<void> {
    const result = await this.#host.create(request);
    if (!result.ok) {
      this.#host.notify(
        result.error.code === "NAME_EXISTS" ? "new-name-taken" : "new-failed",
        request.name,
      );
    }
  }
}
