import type { EditorFileService } from "./editor-files/file-service.ts";
import type { ProjectFlushGate } from "./project-flush-gate.ts";
import type { ReleaseExtras } from "./project-release.ts";

// 改名、移到废纸篓时编辑器那一份：先让界面把未保存的修改写入，再放掉项目文件夹的监听
// （监听占着文件夹，改名和移走会被占用），做完或没做成再接回来（技术设计 §6.4）。
export function createEditorRelease(
  files: Pick<EditorFileService, "unwatch" | "watch" | "isWatching">,
  gate: Pick<ProjectFlushGate, "request">,
  language?: { close(id: string): Promise<void> },
): ReleaseExtras {
  /** 放掉之前正在监听的项目：只有它们需要接回来 */
  const released = new Set<string>();
  return {
    closed: async (id) => {
      await language?.close(id);
    },
    flush: (id, ask) => gate.request(id, ask),
    release: async (id) => {
      if (files.isWatching(id)) released.add(id);
      await Promise.all([files.unwatch(id), language?.close(id)]);
    },
    restore: async (id) => {
      if (released.delete(id)) await files.watch(id);
    },
  };
}
