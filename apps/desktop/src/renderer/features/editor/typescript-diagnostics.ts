import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { EditorRuntime } from "../../editor/runtime-types.ts";

// 打开的 TS、JS 文件的类型错误（规格 DESKTOP-EDITOR-42、43、44）。
// Monaco 自带的检查只在“本文件的内容变了”时重做；别的文件改名、删除后这个文件里的引用该变红却不会（K8 实测，
// 4 秒内没有任何变化）。所以关掉自带的语义检查，改成我们自己对每个打开的文件问语言服务，
// 项目里任何一处有变化都全部重问一遍（K8：每个文件 6 到 15 毫秒），结果写成标记，悬停说明也是它们。

export const MARKER_OWNER = "runyard-ts";
const REFRESH_DELAY_MS = 250;

interface DiagnosticMessageChain {
  messageText: string;
  next?: DiagnosticMessageChain[];
}
interface TsDiagnostic {
  start?: number;
  length?: number;
  code: number;
  category: number;
  messageText: string | DiagnosticMessageChain;
}

function flatten(message: string | DiagnosticMessageChain, depth = 0): string {
  if (typeof message === "string") return message;
  let text = message.messageText;
  for (const next of message.next ?? [])
    text += `\n${"  ".repeat(depth + 1)}${flatten(next, depth + 1)}`;
  return text;
}

export function isTypeScriptLanguage(id: string): boolean {
  return id === "typescript" || id === "javascript";
}

export class TypeScriptDiagnostics {
  readonly #runtime: EditorRuntime;
  readonly #models: () => Iterable<Monaco.editor.ITextModel>;
  readonly #ignored: ReadonlySet<number>;
  readonly #delay: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  /** 序号：较新的一轮开始后，较旧的一轮返回的结果作废 */
  #round = 0;

  constructor(options: {
    runtime: EditorRuntime;
    /** 此刻打开着的模型 */
    models: () => Iterable<Monaco.editor.ITextModel>;
    ignoredCodes: readonly number[];
    delayMs?: number;
  }) {
    this.#runtime = options.runtime;
    this.#models = options.models;
    this.#ignored = new Set(options.ignoredCodes);
    this.#delay = options.delayMs ?? REFRESH_DELAY_MS;
  }

  /** 合并短时间内的多次请求 */
  schedule(): void {
    if (this.#disposed || this.#timer !== undefined) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.refreshNow();
    }, this.#delay);
  }

  /** 对每个打开的 TS、JS 文件重问一遍并写入标记；返回时标记已更新 */
  async refreshNow(): Promise<void> {
    const round = ++this.#round;
    const models = [...this.#models()].filter((model) =>
      isTypeScriptLanguage(model.getLanguageId()),
    );
    await Promise.all(models.map((model) => this.#check(model, round)));
  }

  async #check(model: Monaco.editor.ITextModel, round: number): Promise<void> {
    const { typescript, monaco } = this.#runtime;
    const language = model.getLanguageId();
    const version = model.getVersionId();
    try {
      const getWorker =
        language === "javascript"
          ? await typescript.getJavaScriptWorker()
          : await typescript.getTypeScriptWorker();
      const worker = await getWorker(model.uri);
      const found = (await worker.getSemanticDiagnostics(model.uri.toString())) as TsDiagnostic[];
      // 等的过程中模型被关了、又改了，或者有更新的一轮：这份结果已经过时
      if (this.#disposed || model.isDisposed() || round !== this.#round) return;
      if (model.getVersionId() !== version) return;
      const markers = found
        .filter((item) => !this.#ignored.has(item.code) && item.start !== undefined)
        .map((item) => {
          const start = model.getPositionAt(item.start ?? 0);
          const end = model.getPositionAt((item.start ?? 0) + (item.length ?? 0));
          return {
            severity:
              item.category === 0 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
            message: flatten(item.messageText),
            code: String(item.code),
            source: "ts",
          };
        });
      monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
    } catch {
      // 线程重启或模型刚关：下一轮会再问
    }
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    for (const model of this.#models()) {
      if (!model.isDisposed()) this.#runtime.monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
  }
}
