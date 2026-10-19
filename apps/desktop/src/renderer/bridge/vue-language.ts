import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { VueDiagnostics, VueRequest, VueResult } from "../../shared/vue-language.ts";

export interface VueDocumentBridge {
  open(path: string, text: string, version: number, session: string): Promise<void>;
  sync(path: string, text: string, version: number, session: string): Promise<void>;
  close(path: string, version: number, session: string): Promise<void>;
  request(input: Omit<VueRequest, "project">): Promise<VueResult>;
  cancel(requestId: string): void;
  diagnostics(listener: (event: VueDiagnostics) => void): () => void;
}
export function bridgeVueLanguage(bridge: DesktopBridge, project: string): VueDocumentBridge {
  return {
    open: async (path, text, version, session) => {
      await bridge.call("vue.open", { project, path, text, version, session });
    },
    sync: async (path, text, version, session) => {
      await bridge.call("vue.sync", { project, path, text, version, session });
    },
    close: (path, version, session) =>
      bridge.call("vue.close", { project, path, version, session }),
    request: (input) => bridge.call("vue.request", { ...input, project }),
    cancel: (requestId) => {
      void bridge.call("vue.cancel", { project, requestId }).catch(() => {});
    },
    diagnostics: (listener) =>
      bridge.on("vue.diagnostics", (event) => {
        if (event.project === project) listener(event);
      }),
  };
}
