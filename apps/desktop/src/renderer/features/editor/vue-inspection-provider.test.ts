import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { expect, it, vi } from "vitest";
import type { VueDiagnostics } from "../../../shared/vue-language.ts";
import type { VueDocumentBridge } from "../../bridge/vue-language.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { registerVueInspection, VUE_MARKER_OWNER } from "./vue-inspection-provider.ts";
import { VueModelSync, vueModelSession } from "./vue-model-sync.ts";

it("[DESKTOP-EDITOR-85] 跳转只登记主进程确认过的目标；诊断必须匹配模型session和版本", async () => {
  let listener: (event: VueDiagnostics) => void = () => {};
  let provider: Monaco.languages.DefinitionProvider | undefined;
  let version = 1;
  const markers = vi.fn();
  const model = {
    uri: { path: "/App.vue" },
    getLanguageId: () => "vue",
    getValue: () => "<Child />",
    getVersionId: () => version,
    isDisposed: () => false,
    onDidChangeContent: () => ({ dispose() {} }),
    onWillDispose: () => ({ dispose() {} }),
    validateRange: (value: Monaco.IRange) => value,
  } as unknown as Monaco.editor.ITextModel;
  const bridge = {
    open: async () => {},
    sync: async () => {},
    close: async () => {},
    cancel: vi.fn(),
    diagnostics: (callback: typeof listener) => {
      listener = callback;
      return () => {};
    },
    request: async () => ({
      ok: true,
      value: {
        targets: [
          {
            path: "src/Child.vue",
            range: { start: { line: 2, character: 10 }, end: { line: 2, character: 15 } },
          },
        ],
      },
    }),
  } as unknown as VueDocumentBridge;
  new VueModelSync(bridge).attach("App.vue", model);
  const runtime = {
    monaco: {
      Uri: { from: (value: unknown) => value },
      MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
      editor: { setModelMarkers: markers },
      languages: {
        registerHoverProvider: () => ({ dispose() {} }),
        registerDefinitionProvider: (_id: string, value: Monaco.languages.DefinitionProvider) => {
          provider = value;
          return { dispose() {} };
        },
      },
    },
  } as unknown as EditorRuntime;
  const registration = registerVueInspection({
    runtime,
    bridge,
    owns: (candidate) => candidate === model,
    synced: async () => {},
    models: () => [model],
  });
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose() {} }),
  } as Monaco.CancellationToken;
  const result = await provider?.provideDefinition(
    model,
    { lineNumber: 1, column: 3 } as Monaco.Position,
    token,
  );
  expect(result).toEqual([
    {
      uri: { scheme: "file", path: "/src/Child.vue" },
      range: { startLineNumber: 3, startColumn: 11, endLineNumber: 3, endColumn: 16 },
    },
  ]);
  expect(registration.canOpen("src/Child.vue")).toBe(true);
  expect(registration.canOpen("outside.vue")).toBe(false);
  const event: VueDiagnostics = {
    project: "p",
    path: "App.vue",
    session: vueModelSession(model) ?? "",
    version: 1,
    syntax: [],
    vue: [],
    semantic: [
      {
        code: 2322,
        category: "error",
        text: "wrong",
        start: { line: 1, offset: 1 },
        end: { line: 1, offset: 3 },
      },
    ],
  };
  listener({ ...event, session: "old-model" });
  listener({ ...event, version: 0 });
  expect(markers).not.toHaveBeenCalled();
  listener(event);
  expect(markers).toHaveBeenLastCalledWith(model, VUE_MARKER_OWNER, [
    expect.objectContaining({ code: "2322" }),
  ]);
  version = 2;
  listener(event);
  expect(markers).toHaveBeenCalledOnce();
  registration.dispose();
});
