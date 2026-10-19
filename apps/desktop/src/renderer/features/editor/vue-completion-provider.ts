import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { VueDocumentBridge } from "../../bridge/vue-language.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import {
  type VueCompletionItem,
  vueCompletionDetails,
  vueCompletionItems,
} from "./vue-completion-items.ts";
import { vueModelSession } from "./vue-model-sync.ts";

interface CompletionInput {
  runtime: EditorRuntime;
  bridge: VueDocumentBridge;
  owns(model: Monaco.editor.ITextModel): boolean;
  synced(model: Monaco.editor.ITextModel): Promise<void>;
}
interface Origin {
  model: Monaco.editor.ITextModel;
  session: string;
  version: number;
}
/** 每个宿主只服务自己的模型，旧宿主释放时注销提供者和请求。 */
class VueCompletionProvider implements Monaco.languages.CompletionItemProvider, Monaco.IDisposable {
  readonly triggerCharacters = ["<", ":", "@", ".", " ", '"', "'", "/"];
  readonly #input: CompletionInput;
  readonly #pending = new Set<string>();
  readonly #records = new WeakMap<Monaco.languages.CompletionItem, Origin>();
  #disposed = false;
  constructor(input: CompletionInput) {
    this.#input = input;
  }
  #current(origin: Origin): boolean {
    return (
      !this.#disposed &&
      !origin.model.isDisposed() &&
      origin.model.getVersionId() === origin.version &&
      vueModelSession(origin.model) === origin.session
    );
  }
  async #request(
    model: Monaco.editor.ITextModel,
    token: Monaco.CancellationToken,
    kind: "completion" | "completionDetails",
    position?: Monaco.Position,
    detailId?: string,
  ) {
    const requestId = `completion-${crypto.randomUUID()}`;
    this.#pending.add(requestId);
    const cancellation = token.onCancellationRequested(() => this.#input.bridge.cancel(requestId));
    try {
      await this.#input.synced(model);
      if (this.#disposed || token.isCancellationRequested || model.isDisposed()) return null;
      const result = await this.#input.bridge.request({
        path: model.uri.path.slice(1),
        requestId,
        kind,
        ...(position
          ? { position: { line: position.lineNumber - 1, character: position.column - 1 } }
          : {}),
        ...(detailId ? { detailId } : {}),
      });
      return result.ok && !token.isCancellationRequested && !this.#disposed ? result.value : null;
    } catch {
      return null;
    } finally {
      cancellation.dispose();
      this.#pending.delete(requestId);
    }
  }
  async provideCompletionItems(
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
    _context: Monaco.languages.CompletionContext,
    token: Monaco.CancellationToken,
  ): Promise<Monaco.languages.CompletionList> {
    const session = vueModelSession(model);
    const version = model.getVersionId();
    if (!this.#input.owns(model) || !session) return { suggestions: [] };
    const origin = { model, session, version };
    const value = await this.#request(model, token, "completion", position);
    if (!this.#current(origin)) return { suggestions: [] };
    const word = model.getWordUntilPosition(position);
    const list = vueCompletionItems(value, {
      kinds: this.#input.runtime.monaco.languages.CompletionItemKind,
      session,
      version,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      },
    });
    for (const item of list.suggestions) this.#records.set(item, origin);
    return list;
  }
  async resolveCompletionItem(
    item: Monaco.languages.CompletionItem,
    token: Monaco.CancellationToken,
  ): Promise<Monaco.languages.CompletionItem> {
    const origin = this.#records.get(item);
    const data = item as VueCompletionItem;
    if (!origin || !this.#current(origin)) return item;
    const value = await this.#request(
      origin.model,
      token,
      "completionDetails",
      undefined,
      data.vueDetailId,
    );
    return this.#current(origin) ? { ...item, ...vueCompletionDetails(value) } : item;
  }
  dispose(): void {
    this.#disposed = true;
    for (const id of this.#pending) this.#input.bridge.cancel(id);
    this.#pending.clear();
  }
}
export function registerVueCompletion(input: CompletionInput): Monaco.IDisposable {
  const provider = new VueCompletionProvider(input);
  const registration = input.runtime.monaco.languages.registerCompletionItemProvider(
    "vue",
    provider,
  );
  return {
    dispose() {
      provider.dispose();
      registration.dispose();
    },
  };
}
