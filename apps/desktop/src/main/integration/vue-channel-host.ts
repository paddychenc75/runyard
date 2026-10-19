import { desktopChannels } from "../../shared/desktop-bridge.ts";
import type { IpcHost } from "../ipc-handlers.ts";
import type { LibraryController } from "../library-controller.ts";
import { VueChannel } from "../vue-language/vue-channel.ts";
import { watchVueDependencies } from "./vue-dependency-watch.ts";
import { createVueLanguageHost } from "./vue-language-host.ts";

export function createVueChannelHost(
  home: string,
  distDir: string,
  controller: LibraryController,
  ipc: IpcHost,
): VueChannel {
  const projects = createVueLanguageHost(home, distDir, (project, state) => {
    ipc.send(desktopChannels.event, "vue.status", { project, state });
    if (state === "ready") channel.refresh(project);
  });
  const channel = new VueChannel({
    projects,
    folderOf: (id) =>
      controller.getState().tabs.some((tab) => tab.id === id) ? controller.folderOf(id) : null,
    diagnostics: (value) => ipc.send(desktopChannels.event, "vue.diagnostics", value),
    watchDependencies: watchVueDependencies,
  });
  return channel;
}
