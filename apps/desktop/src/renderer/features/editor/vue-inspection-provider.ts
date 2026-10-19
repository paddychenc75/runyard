import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { vueDiagnosticMarkers, vueHover, vueRange, vueRecord } from "./vue-inspection-items.ts";
import { type VueModelRequestInput, VueModelRequests } from "./vue-model-requests.ts";
import { vueModelSession } from "./vue-model-sync.ts";

export const VUE_MARKER_OWNER = "runyard-vue";
interface Input extends VueModelRequestInput {
  runtime: EditorRuntime;
  models(): Iterable<Monaco.editor.ITextModel>;
}
export function registerVueInspection(
  input: Input,
): Monaco.IDisposable & { canOpen(path: string): boolean } {
  const requests = new VueModelRequests(input);
  const { monaco } = input.runtime;
  const targets = new Set<string>();
  const hover = monaco.languages.registerHoverProvider("vue", {
    async provideHover(model, position, token) {
      const origin = requests.origin(model);
      if (!origin) return null;
      return vueHover(await requests.request(origin, token, "hover", position));
    },
  });
  const definition = monaco.languages.registerDefinitionProvider("vue", {
    async provideDefinition(model, position, token) {
      const origin = requests.origin(model);
      if (!origin) return [];
      const response = vueRecord(await requests.request(origin, token, "definition", position));
      const locations: Monaco.languages.Location[] = [];
      for (const item of Array.isArray(response.targets) ? response.targets : []) {
        const target = vueRecord(item);
        const range = vueRange(target.range);
        if (!range || typeof target.path !== "string") continue;
        targets.add(target.path);
        locations.push({
          uri: monaco.Uri.from({ scheme: "file", path: `/${target.path}` }),
          range,
        });
      }
      return locations;
    },
  });
  const unsubscribe = input.bridge.diagnostics((event) => {
    for (const model of input.models()) {
      if (
        model.isDisposed() ||
        model.uri.path.slice(1) !== event.path ||
        vueModelSession(model) !== event.session ||
        model.getVersionId() !== event.version
      )
        continue;
      const markers = vueDiagnosticMarkers(event, monaco.MarkerSeverity).map((marker) => ({
        ...marker,
        ...model.validateRange(marker),
      }));
      monaco.editor.setModelMarkers(model, VUE_MARKER_OWNER, markers);
    }
  });
  return {
    canOpen: (path) => targets.has(path),
    dispose() {
      requests.dispose();
      hover.dispose();
      definition.dispose();
      unsubscribe();
      targets.clear();
      for (const model of input.models())
        if (!model.isDisposed()) monaco.editor.setModelMarkers(model, VUE_MARKER_OWNER, []);
    },
  };
}
