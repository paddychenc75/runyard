import { pathToFileURL } from "node:url";
import type { VueRequest } from "../../shared/vue-language.ts";
import type { VueSession } from "./vue-projects.ts";

interface Detail {
  file: string;
  target: "vue" | "ts";
  item: Record<string, unknown>;
  position: { line: number; offset: number };
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 补全详情只接受主进程缓存的候选，页面不能借详情接口传任意文件或协议命令。 */
export class VueOperations {
  readonly #details = new Map<string, Detail>();
  #next = 0;
  clear(file?: string): void {
    if (!file) this.#details.clear();
    else
      for (const [key, value] of this.#details) if (value.file === file) this.#details.delete(key);
  }
  async request(
    session: VueSession,
    file: string,
    input: VueRequest,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const position = input.position ?? { line: 0, character: 0 };
    const tsPosition = { file, line: position.line + 1, offset: position.character + 1 };
    const lspPosition = { textDocument: { uri: pathToFileURL(file).href }, position };
    if (input.kind === "diagnostics") return this.diagnostics(session, file, signal);
    if (input.kind === "completionDetails") {
      const found = this.#details.get(input.detailId ?? "");
      if (!found || found.file !== file) throw new Error("LANGUAGE_DETAIL_UNKNOWN");
      return found.target === "vue"
        ? session.request("vue", "completionItem/resolve", found.item, signal)
        : session.request(
            "ts",
            "completionEntryDetails",
            {
              file,
              ...found.position,
              entryNames: [
                { name: found.item.name, source: found.item.source, data: found.item.data },
              ],
            },
            signal,
          );
    }
    if (input.kind === "completion") {
      const [vue, ts] = await Promise.all([
        session.request("vue", "textDocument/completion", lspPosition, signal),
        session.request("ts", "completionInfo", tsPosition, signal).catch(() => null),
      ]);
      if (signal?.aborted) throw new Error("LANGUAGE_CANCELLED");
      this.clear(file);
      const candidates = [
        ...array(Array.isArray(vue) ? vue : object(vue).items).map((item) => ({
          target: "vue" as const,
          item,
        })),
        ...array(object(ts).entries).map((item) => ({ target: "ts" as const, item })),
      ].map(({ target, item }) => {
        const detailId = String(++this.#next);
        this.#details.set(detailId, {
          file,
          target,
          item: object(item),
          position: { line: tsPosition.line, offset: tsPosition.offset },
        });
        return { target, item, detailId };
      });
      // 每次响应有界；旧文档已清掉的候选也不能无限留在主进程。
      while (this.#details.size > 10_000)
        this.#details.delete(this.#details.keys().next().value ?? "");
      return { candidates, incomplete: object(vue).isIncomplete === true };
    }
    const method = input.kind === "hover" ? "quickinfo" : "definition";
    const [vue, ts] = await Promise.all([
      session
        .request(
          "vue",
          input.kind === "hover" ? "textDocument/hover" : "textDocument/definition",
          lspPosition,
          signal,
        )
        .catch(() => null),
      session.request("ts", method, tsPosition, signal).catch(() => null),
    ]);
    return { vue, ts };
  }
  async diagnostics(session: VueSession, file: string, signal?: AbortSignal) {
    const [vue, syntax, semantic] = await Promise.all([
      session
        .request(
          "vue",
          "textDocument/diagnostic",
          { textDocument: { uri: pathToFileURL(file).href } },
          signal,
        )
        .catch(() => null),
      session.request("ts", "syntacticDiagnosticsSync", { file }, signal).catch(() => []),
      session.request("ts", "semanticDiagnosticsSync", { file }, signal).catch(() => []),
    ]);
    return { vue: array(object(vue).items), syntax: array(syntax), semantic: array(semantic) };
  }
}
