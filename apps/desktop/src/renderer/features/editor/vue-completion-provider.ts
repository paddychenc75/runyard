import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import {
  type VueCompletionItem,
  vueCompletionDetails,
  vueCompletionItems,
} from "./vue-completion-items.ts";
import {
  type VueModelOrigin,
  type VueModelRequestInput,
  VueModelRequests,
} from "./vue-model-requests.ts";

interface CompletionInput extends VueModelRequestInput {
  runtime: EditorRuntime;
}
/** 每个宿主只服务自己的模型，旧宿主释放时注销提供者和请求。 */
class VueCompletionProvider implements Monaco.languages.CompletionItemProvider, Monaco.IDisposable {
  readonly triggerCharacters = ["<", ":", "@", ".", " ", '"', "'", "/"];
  readonly #input: CompletionInput;
  readonly #requests: VueModelRequests;
  readonly #records = new WeakMap<Monaco.languages.CompletionItem, VueModelOrigin>();
  constructor(input: CompletionInput) {
    this.#input = input;
    this.#requests = new VueModelRequests(input);
  }
  async provideCompletionItems(
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
    _context: Monaco.languages.CompletionContext,
    token: Monaco.CancellationToken,
  ): Promise<Monaco.languages.CompletionList> {
    const origin = this.#requests.origin(model);
    if (!origin) return { suggestions: [] };
    const value = await this.#requests.request(origin, token, "completion", position);
    if (!this.#requests.current(origin)) return { suggestions: [] };
    const word = model.getWordUntilPosition(position);
    const list = vueCompletionItems(value, {
      kinds: this.#input.runtime.monaco.languages.CompletionItemKind,
      session: origin.session,
      version: origin.version,
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
    if (!origin || !this.#requests.current(origin)) return item;
    const value = await this.#requests.request(
      origin,
      token,
      "completionDetails",
      undefined,
      data.vueDetailId,
    );
    return this.#requests.current(origin) ? { ...item, ...vueCompletionDetails(value) } : item;
  }
  dispose(): void {
    this.#requests.dispose();
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
