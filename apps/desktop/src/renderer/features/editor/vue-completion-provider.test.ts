import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { expect, it, vi } from "vitest";
import type { VueDocumentBridge } from "../../bridge/vue-language.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { registerVueCompletion } from "./vue-completion-provider.ts";
import { VueModelSync } from "./vue-model-sync.ts";

it("补全等待文档同步，模型版本变更后旧响应不进入候选，取消原样交给窄通道", async () => {
  let version = 1;
  let cancel = () => {};
  let cancelled = false;
  let resolveRequest: (value: unknown) => void = () => {};
  const pending = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const bridge = {
    open: async () => {},
    sync: async () => {},
    close: async () => {},
    request: vi.fn(() => pending),
    cancel: vi.fn(),
  } as unknown as VueDocumentBridge;
  const model = {
    uri: { path: "/App.vue" },
    getLanguageId: () => "vue",
    getValue: () => "<Child ",
    getVersionId: () => version,
    isDisposed: () => false,
    getWordUntilPosition: () => ({ startColumn: 8, endColumn: 8 }),
    onDidChangeContent: () => ({ dispose() {} }),
    onWillDispose: () => ({ dispose() {} }),
  } as unknown as Monaco.editor.ITextModel;
  const sync = new VueModelSync(bridge);
  sync.attach("App.vue", model);
  let provider: Monaco.languages.CompletionItemProvider | undefined;
  const unregister = vi.fn();
  const runtime = {
    monaco: {
      languages: {
        CompletionItemKind: { Text: 18 },
        registerCompletionItemProvider: (
          _language: string,
          value: Monaco.languages.CompletionItemProvider,
        ) => {
          provider = value;
          return { dispose: unregister };
        },
      },
    },
  } as unknown as EditorRuntime;
  const registration = registerVueCompletion({
    runtime,
    bridge,
    owns: (candidate) => candidate === model,
    synced: (candidate) => sync.synced(candidate),
  });
  const token = {
    get isCancellationRequested() {
      return cancelled;
    },
    onCancellationRequested: (listener: () => void) => {
      cancel = listener;
      return { dispose() {} };
    },
  } as Monaco.CancellationToken;
  const result = provider?.provideCompletionItems(
    model,
    { lineNumber: 1, column: 8 } as Monaco.Position,
    { triggerKind: 0 },
    token,
  );
  await vi.waitFor(() => expect(bridge.request).toHaveBeenCalledOnce());
  version = 2;
  cancelled = true;
  cancel();
  resolveRequest({
    ok: true,
    value: { candidates: [{ target: "vue", detailId: "one", item: { label: "title" } }] },
  });
  expect(await result).toEqual({ suggestions: [] });
  expect(bridge.cancel).toHaveBeenCalledOnce();
  cancelled = false;
  const stale = provider?.provideCompletionItems(
    model,
    { lineNumber: 1, column: 8 } as Monaco.Position,
    { triggerKind: 0 },
    token,
  );
  version = 3;
  expect(await stale).toEqual({ suggestions: [] });
  registration.dispose();
  expect(unregister).toHaveBeenCalledOnce();
});
