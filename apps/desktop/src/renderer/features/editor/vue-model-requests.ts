import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { VueFormatOptions, VueRequestKind } from "../../../shared/vue-language.ts";
import type { VueDocumentBridge } from "../../bridge/vue-language.ts";
import { vueModelSession } from "./vue-model-sync.ts";

export interface VueModelOrigin {
  model: Monaco.editor.ITextModel;
  session: string;
  version: number;
}
export interface VueModelRequestInput {
  bridge: VueDocumentBridge;
  owns(model: Monaco.editor.ITextModel): boolean;
  synced(model: Monaco.editor.ITextModel): Promise<void>;
}
/** 提供者共用同一个文档身份规则；等待同步期间变更/取消，不能拿旧位置询问新文本。 */
export class VueModelRequests {
  readonly #input: VueModelRequestInput;
  readonly #pending = new Set<string>();
  #disposed = false;
  constructor(input: VueModelRequestInput) {
    this.#input = input;
  }
  origin(model: Monaco.editor.ITextModel): VueModelOrigin | null {
    const session = vueModelSession(model);
    return this.#input.owns(model) && session
      ? { model, session, version: model.getVersionId() }
      : null;
  }
  current(origin: VueModelOrigin): boolean {
    return (
      !this.#disposed &&
      this.#input.owns(origin.model) &&
      !origin.model.isDisposed() &&
      origin.model.getVersionId() === origin.version &&
      vueModelSession(origin.model) === origin.session
    );
  }
  async request(
    origin: VueModelOrigin,
    token: Monaco.CancellationToken,
    kind: VueRequestKind,
    position?: Monaco.Position,
    detailId?: string,
    format?: VueFormatOptions,
  ): Promise<unknown> {
    const requestId = `vue-${crypto.randomUUID()}`;
    this.#pending.add(requestId);
    const cancellation = token.onCancellationRequested(() => this.#input.bridge.cancel(requestId));
    try {
      await this.#input.synced(origin.model);
      if (!this.current(origin) || token.isCancellationRequested) return null;
      const result = await this.#input.bridge.request({
        path: origin.model.uri.path.slice(1),
        requestId,
        kind,
        ...(position
          ? { position: { line: position.lineNumber - 1, character: position.column - 1 } }
          : {}),
        ...(detailId ? { detailId } : {}),
        ...(format ? { format } : {}),
      });
      return result.ok && !token.isCancellationRequested && this.current(origin)
        ? result.value
        : null;
    } catch {
      return null;
    } finally {
      cancellation.dispose();
      this.#pending.delete(requestId);
    }
  }
  dispose(): void {
    this.#disposed = true;
    for (const id of this.#pending) this.#input.bridge.cancel(id);
    this.#pending.clear();
  }
}
