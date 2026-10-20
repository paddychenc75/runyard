import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { registerVueCompletion } from "./vue-completion-provider.ts";
import { registerVueInspection } from "./vue-inspection-provider.ts";
import type { VueModelRequestInput } from "./vue-model-requests.ts";

export function createVueEditorServices(
  input: VueModelRequestInput & {
    runtime: EditorRuntime;
    models(): Iterable<Monaco.editor.ITextModel>;
  },
): Monaco.IDisposable & { canOpen(path: string): boolean } {
  const completion = registerVueCompletion(input);
  const inspection = registerVueInspection(input);
  return {
    canOpen: inspection.canOpen,
    dispose() {
      completion.dispose();
      inspection.dispose();
    },
  };
}
