import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { VueDocumentBridge } from "../../bridge/vue-language.ts";

/** 模型同步与编辑/保存分离；服务启动或崩溃不能阻塞编辑器的内容变更。 */
const sessions = new WeakMap<Monaco.editor.ITextModel, string>();
export function vueModelSession(model: Monaco.editor.ITextModel): string | undefined {
  return sessions.get(model);
}
export class VueModelSync {
  readonly #bridge: VueDocumentBridge;
  readonly #queues = new Map<string, Promise<void>>();
  constructor(bridge: VueDocumentBridge) {
    this.#bridge = bridge;
  }
  #queue(path: string, task: () => Promise<void>) {
    const pending = (this.#queues.get(path) ?? Promise.resolve()).then(task).catch(() => {});
    this.#queues.set(path, pending);
    void pending.then(() => {
      if (this.#queues.get(path) === pending) this.#queues.delete(path);
    });
  }
  synced(model: Monaco.editor.ITextModel): Promise<void> {
    return this.#queues.get(model.uri.path.slice(1)) ?? Promise.resolve();
  }
  attach(path: string, model: Monaco.editor.ITextModel): void {
    if (model.getLanguageId() !== "vue") return;
    const session = crypto.randomUUID();
    sessions.set(model, session);
    const initialText = model.getValue();
    const initialVersion = model.getVersionId();
    this.#queue(path, () => this.#bridge.open(path, initialText, initialVersion, session));
    const sync = () => {
      const text = model.getValue();
      const version = model.getVersionId();
      this.#queue(path, () => this.#bridge.sync(path, text, version, session));
    };
    const change = model.onDidChangeContent(sync);
    const dispose = model.onWillDispose(() => {
      change.dispose();
      dispose.dispose();
      const version = model.getVersionId();
      this.#queue(path, () => this.#bridge.close(path, version, session));
    });
  }
}
