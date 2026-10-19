import { pathToFileURL } from "node:url";
import type { LanguageProcess } from "../integration/vue-process.ts";
import { LanguageFrames, languageFrame } from "./language-frames.ts";
import type { LanguageDocument, LanguageTarget, VueSession } from "./vue-projects.ts";

interface Waiting {
  resolve(value: unknown): void;
  reject(error: Error): void;
  clean(): void;
}
interface SessionInput {
  folder: string;
  launch(target: LanguageTarget): Promise<LanguageProcess>;
  failed(): void;
  event?(method: string, params: unknown): void;
}
/** 仅供主进程调用；界面通道另设方法白名单，不把原始请求暴露给 renderer。 */
class ProtocolSession implements VueSession {
  readonly #input: SessionInput;
  readonly #processes: Record<LanguageTarget, LanguageProcess>;
  readonly #waiting = { ts: new Map<number, Waiting>(), vue: new Map<number, Waiting>() };
  readonly #documents = new Map<string, LanguageDocument>();
  #sequence = 0;
  #stopped = false;
  #failed = false;
  constructor(input: SessionInput, processes: Record<LanguageTarget, LanguageProcess>) {
    this.#input = input;
    this.#processes = processes;
    for (const target of ["ts", "vue"] as const) {
      const frames = new LanguageFrames();
      processes[target].onExit(() => this.#crashed());
      processes[target].onData((chunk) => {
        try {
          for (const message of frames.push(chunk))
            void this.#receive(target, message).catch(() => this.#crashed());
        } catch {
          this.#crashed();
        }
      });
    }
  }
  #clear(error: Error) {
    for (const pending of Object.values(this.#waiting)) {
      for (const item of pending.values()) {
        item.clean();
        item.reject(error);
      }
      pending.clear();
    }
  }
  #crashed() {
    if (this.#stopped || this.#failed) return;
    this.#failed = true;
    this.#clear(new Error("LANGUAGE_PROCESS_EXITED"));
    this.#input.failed();
  }
  #send(target: LanguageTarget, message: unknown) {
    this.#processes[target].write(
      target === "vue" ? languageFrame(message) : `${JSON.stringify(message)}\n`,
    );
  }
  #notify(method: string, params: unknown) {
    this.#send("vue", { jsonrpc: "2.0", method, params });
  }
  request(
    target: LanguageTarget,
    method: string,
    params: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (this.#stopped || this.#failed) return Promise.reject(new Error("LANGUAGE_PROCESS_EXITED"));
    if (signal?.aborted) return Promise.reject(new Error("LANGUAGE_CANCELLED"));
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const finish = (error: string) => {
        this.#waiting[target].delete(id);
        clean();
        reject(new Error(error));
      };
      const timer = setTimeout(() => finish("LANGUAGE_REQUEST_TIMEOUT"), 10_000);
      const abort = () => {
        try {
          if (target === "vue" && !this.#stopped && !this.#failed)
            this.#notify("$/cancelRequest", { id });
        } catch {
          /* 退出与取消交错时，仍立即结束本地等待。 */
        }
        finish("LANGUAGE_CANCELLED");
      };
      const clean = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      this.#waiting[target].set(id, { resolve, reject, clean });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        this.#send(
          target,
          target === "vue"
            ? { jsonrpc: "2.0", id, method, params }
            : { seq: id, type: "request", command: method, arguments: params },
        );
      } catch (error) {
        clean();
        this.#waiting[target].delete(id);
        reject(error);
      }
    });
  }
  reloadProjects(): void {
    if (!this.#stopped && !this.#failed)
      this.#send("ts", {
        seq: ++this.#sequence,
        type: "request",
        command: "reloadProjects",
        arguments: {},
      });
  }
  changed(files: { uri: string; type: number }[]): void {
    if (!this.#stopped && !this.#failed)
      this.#notify("workspace/didChangeWatchedFiles", { changes: files });
  }
  async #receive(target: LanguageTarget, message: Record<string, unknown>) {
    if (target === "vue" && typeof message.method === "string") {
      if (message.method === "tsserver/request") {
        for (const [id, command, args] of message.params as [number, string, unknown][]) {
          const body = await this.request("ts", command, args).catch(() => null);
          if (!this.#stopped && !this.#failed) this.#notify("tsserver/response", [[id, body]]);
        }
      } else if (message.id !== undefined) {
        const items = (message.params as { items?: unknown[] } | undefined)?.items;
        this.#send("vue", {
          jsonrpc: "2.0",
          id: message.id,
          result:
            message.method === "workspace/configuration" ? (items?.map(() => null) ?? []) : null,
        });
      } else this.#input.event?.(message.method, message.params);
      return;
    }
    const id = target === "vue" ? message.id : message.request_seq;
    if (typeof id !== "number") return;
    const item = this.#waiting[target].get(id);
    if (!item) return;
    this.#waiting[target].delete(id);
    item.clean();
    if (message.error || message.success === false)
      item.reject(new Error("LANGUAGE_REQUEST_FAILED"));
    else item.resolve(target === "vue" ? message.result : message.body);
  }
  async initialize(): Promise<void> {
    await this.request("ts", "configure", {
      preferences: { includeCompletionsWithInsertText: true },
      hostInfo: "runyard",
    });
    await this.request("vue", "initialize", {
      processId: null,
      rootUri: pathToFileURL(this.#input.folder).href,
      capabilities: {
        textDocument: {
          completion: { completionItem: { snippetSupport: true } },
          hover: { contentFormat: ["markdown", "plaintext"] },
          diagnostic: {},
        },
        workspace: { configuration: true },
      },
    });
    this.#notify("initialized", {});
  }
  async stop(): Promise<void> {
    this.#stopped = true;
    this.#clear(new Error("LANGUAGE_CLOSED"));
    await Promise.all([this.#processes.ts.stop(), this.#processes.vue.stop()]);
  }
  async sync(document: LanguageDocument): Promise<void> {
    const previous = this.#documents.get(document.file);
    const uri = pathToFileURL(document.file).href;
    if (previous) {
      const lines = previous.text.split("\n");
      await this.request("ts", "updateOpen", {
        changedFiles: [
          {
            fileName: document.file,
            textChanges: [
              {
                start: { line: 1, offset: 1 },
                end: { line: lines.length, offset: (lines.at(-1)?.length ?? 0) + 1 },
                newText: document.text,
              },
            ],
          },
        ],
      });
      this.#notify("textDocument/didChange", {
        textDocument: { uri, version: document.version },
        contentChanges: [{ text: document.text }],
      });
    } else {
      await this.request("ts", "updateOpen", {
        openFiles: [
          {
            file: document.file,
            fileContent: document.text,
            projectRootPath: this.#input.folder,
            scriptKindName: "TS",
          },
        ],
      });
      this.#notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "vue", text: document.text, version: document.version },
      });
    }
    this.#documents.set(document.file, document);
  }
  async closeDocument(file: string): Promise<void> {
    this.#documents.delete(file);
    await this.request("ts", "updateOpen", { closedFiles: [file] });
    this.#notify("textDocument/didClose", { textDocument: { uri: pathToFileURL(file).href } });
  }
}
export async function createVueSession(input: SessionInput): Promise<VueSession> {
  const ts = await input.launch("ts");
  let vue: LanguageProcess;
  try {
    vue = await input.launch("vue");
  } catch (error) {
    await ts.stop();
    throw error;
  }
  const session = new ProtocolSession(input, { ts, vue });
  try {
    await session.initialize();
  } catch (error) {
    await session.stop();
    throw error;
  }
  return session;
}
