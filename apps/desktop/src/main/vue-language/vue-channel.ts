import { pathToFileURL } from "node:url";
import type { FileChange, FileTarget } from "../../shared/editor-files.ts";
import type {
  VueDiagnostics,
  VueDocument,
  VueRequest,
  VueResult,
} from "../../shared/vue-language.ts";
import { confine } from "../editor-files/confine.ts";
import { vueDefinitionTargets } from "./vue-definition-targets.ts";
import { VueOperations } from "./vue-operations.ts";
import type { VueProjects } from "./vue-projects.ts";

interface Document {
  input: VueDocument;
  file: string;
  folder: string;
}
interface ChannelOptions {
  projects: VueProjects;
  /** 只返回标签仍打开的项目，未知或已关闭返回 null。 */
  folderOf(id: string): string | null;
  diagnostics(value: VueDiagnostics): void;
  watchDependencies?(folder: string, changed: () => void): Promise<() => void>;
}
const keyOf = (file: FileTarget) => JSON.stringify([file.project, file.path]);
const invalid: VueResult = { ok: false, reason: "invalid" };

export class VueChannel {
  readonly #options: ChannelOptions;
  readonly #documents = new Map<string, Document>();
  readonly #operations = new VueOperations();
  readonly #requests = new Map<string, AbortController>();
  readonly #epochs = new Map<string, number>();
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #dependencyWatches = new Map<string, () => void>();
  #queue: Promise<unknown> = Promise.resolve();
  constructor(options: ChannelOptions) {
    this.#options = options;
  }
  #serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(task);
    this.#queue = result.catch(() => {});
    return result;
  }
  async #target(input: FileTarget) {
    const folder = this.#options.folderOf(input.project);
    if (!folder || !input.path.endsWith(".vue")) throw new Error("LANGUAGE_INVALID_PATH");
    return confine(folder, input.path);
  }
  open(input: VueDocument): Promise<VueResult> {
    return this.#sync(input, true);
  }
  sync(input: VueDocument): Promise<VueResult> {
    return this.#sync(input, false);
  }
  #sync(input: VueDocument, opening: boolean): Promise<VueResult> {
    return this.#serial(async () => {
      let target: Awaited<ReturnType<typeof confine>>;
      try {
        target = await this.#target(input);
      } catch {
        return invalid;
      }
      const key = keyOf(input);
      const before = this.#documents.get(key);
      if (!opening && before?.input.session !== input.session) return { ok: true, value: null };
      if (before?.input.session === input.session && before.input.version >= input.version)
        return { ok: true, value: null };
      if (before && before.input.session !== input.session)
        await this.#options.projects.closeDocument(input.project, before.file);
      const document = { input, file: target.abs, folder: target.root };
      this.#operations.clear(target.abs);
      this.#documents.set(key, document);
      try {
        if (this.#options.projects.current(input.project)) {
          await this.#options.projects.sync(input.project, target.root, {
            file: target.abs,
            text: input.text,
            version: input.version,
          });
        } else await this.#session(input.project, target.root);
        if (!this.#dependencyWatches.has(input.project) && this.#options.watchDependencies) {
          const stop = await this.#options.watchDependencies(target.root, () => {
            void this.dependenciesChanged(input.project);
          });
          this.#dependencyWatches.set(input.project, stop);
        }
        this.#schedule(input.project);
        return { ok: true, value: null };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    });
  }
  closeDocument(input: FileTarget & { version: number; session: string }): Promise<void> {
    return this.#serial(async () => {
      const key = keyOf(input);
      const document = this.#documents.get(key);
      if (
        document &&
        (document.input.session !== input.session || document.input.version > input.version)
      )
        return;
      this.#documents.delete(key);
      if (document) {
        this.#operations.clear(document.file);
        await this.#options.projects.closeDocument(input.project, document.file);
      }
    });
  }
  async request(input: VueRequest): Promise<VueResult> {
    const key = JSON.stringify([input.project, input.requestId]);
    this.#requests.get(key)?.abort();
    const abort = new AbortController();
    this.#requests.set(key, abort);
    let cancelled = () => {};
    const cancellation = new Promise<VueResult>((resolve) => {
      cancelled = () => resolve({ ok: false, reason: "cancelled" });
      abort.signal.addEventListener("abort", cancelled, { once: true });
    });
    try {
      return await Promise.race([this.#request(input, abort.signal), cancellation]);
    } finally {
      abort.signal.removeEventListener("abort", cancelled);
      if (this.#requests.get(key) === abort) this.#requests.delete(key);
    }
  }
  async #request(input: VueRequest, signal: AbortSignal): Promise<VueResult> {
    try {
      const prepared = await this.#serial(async () => {
        if (signal.aborted) return null;
        const target = await this.#target(input);
        const document = this.#documents.get(keyOf(input));
        if (signal.aborted || !document || document.file !== target.abs) return null;
        // 会话取得与 close 在同一序列：close 返回以后，旧请求不可能再创建服务。
        const session = await this.#session(input.project, target.root);
        if (signal.aborted || this.#documents.get(keyOf(input)) !== document) return null;
        return { session, document };
      });
      if (!prepared) return { ok: false, reason: signal.aborted ? "cancelled" : "invalid" };
      const value = await this.#operations.request(
        prepared.session,
        prepared.document.file,
        input,
        signal,
      );
      if (signal.aborted || this.#documents.get(keyOf(input)) !== prepared.document)
        return { ok: false, reason: "cancelled" };
      return {
        ok: true,
        value:
          input.kind === "definition"
            ? await vueDefinitionTargets(prepared.document.folder, value)
            : value,
      };
    } catch {
      return { ok: false, reason: signal.aborted ? "cancelled" : "unavailable" };
    }
  }
  cancel(project: string, requestId: string): void {
    this.#requests.get(JSON.stringify([project, requestId]))?.abort();
  }
  async filesChanged(project: string, changes: FileChange[]): Promise<void> {
    const document = [...this.#documents.values()].find((item) => item.input.project === project);
    if (!document) return;
    const files: { uri: string; type: number }[] = [];
    for (const change of changes) {
      try {
        const target = await confine(document.folder, change.path);
        files.push({
          uri: pathToFileURL(target.abs).href,
          type: change.kind === "add" ? 1 : change.kind === "change" ? 2 : 3,
        });
      } catch {
        /* 越界链接和已经换走的项目不转发。 */
      }
    }
    try {
      this.#options.projects.current(project)?.changed(files);
      this.#schedule(project);
    } catch {
      /* 服务失败只影响智能提示。 */
    }
  }
  async dependenciesChanged(project: string): Promise<void> {
    const document = [...this.#documents.values()].find((item) => item.input.project === project);
    if (!document) return;
    try {
      const session = this.#options.projects.current(project);
      if (!session) return;
      session.reloadProjects();
      await this.filesChanged(project, [{ path: "node_modules", kind: "change", self: false }]);
    } catch {
      /* 目录正在安装中时，下一次目录事件继续检测。 */
    }
  }
  async #session(project: string, folder: string) {
    const current = this.#options.projects.current(project);
    if (current) return this.#options.projects.open(project, folder);
    const session = await this.#options.projects.open(project, folder);
    for (const document of this.#documents.values())
      if (document.input.project === project) {
        await this.#options.projects.sync(project, folder, {
          file: document.file,
          text: document.input.text,
          version: document.input.version,
        });
      }
    return session;
  }
  refresh(project: string): void {
    this.#schedule(project);
  }
  #schedule(project: string): void {
    this.#epochs.set(project, (this.#epochs.get(project) ?? 0) + 1);
    const timer = this.#timers.get(project);
    if (timer) clearTimeout(timer);
    this.#timers.set(
      project,
      setTimeout(() => {
        this.#timers.delete(project);
        void this.#diagnose(project);
      }, 150),
    );
  }
  async #diagnose(project: string): Promise<void> {
    const epoch = this.#epochs.get(project);
    for (const [key, document] of this.#documents) {
      if (document.input.project !== project) continue;
      try {
        const session = this.#options.projects.current(project);
        if (!session) return;
        const result = await this.#operations.diagnostics(session, document.file);
        if (this.#epochs.get(project) === epoch && this.#documents.get(key) === document)
          this.#options.diagnostics({
            project,
            path: document.input.path,
            version: document.input.version,
            session: document.input.session,
            ...result,
          });
      } catch {
        /* 崩溃由项目管理器恢复，不能影响编辑和保存。 */
      }
    }
  }
  close(project: string): Promise<void> {
    this.#epochs.set(project, (this.#epochs.get(project) ?? 0) + 1);
    for (const [key, abort] of this.#requests) if (JSON.parse(key)[0] === project) abort.abort();
    const timer = this.#timers.get(project);
    if (timer) clearTimeout(timer);
    this.#timers.delete(project);
    return this.#serial(async () => {
      this.#dependencyWatches.get(project)?.();
      this.#dependencyWatches.delete(project);
      for (const [key, document] of this.#documents)
        if (document.input.project === project) {
          this.#documents.delete(key);
          this.#operations.clear(document.file);
        }
      await this.#options.projects.close(project);
    });
  }
  async dispose(): Promise<void> {
    const projects = new Set([
      ...[...this.#documents.values()].map((item) => item.input.project),
      ...this.#dependencyWatches.keys(),
      ...this.#timers.keys(),
    ]);
    for (const project of projects) await this.close(project);
    await this.#options.projects.dispose();
  }
}
