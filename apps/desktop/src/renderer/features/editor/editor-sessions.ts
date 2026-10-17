import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { EditorFileResult } from "../../../shared/editor-files.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { type AutosaveMode, EditorSession, type SessionFiles } from "./editor-session.ts";
import { localOpenFilesMemory } from "./local-open-files-memory.ts";

// 每个打开着的项目标签一个编辑会话：切到别的标签再切回来，未保存的修改和选中的文件都还在。
// 项目标签被关掉，它的会话随之丢弃（未保存修改的处理随 #260 的“关闭前先写入”）。

const ioFailed = (path: string): EditorFileResult<never> => ({
  ok: false,
  error: { code: "EDITOR_IO_FAILED", params: { path } },
});

// 主进程那头出了意外（方法抛错、没接线）时按读写失败处理，编辑器不能因此崩
async function guarded<T>(path: string, call: () => Promise<EditorFileResult<T>>) {
  try {
    const result = await call();
    return result ?? ioFailed(path);
  } catch {
    return ioFailed(path);
  }
}

export function sessionFilesFor(bridge: DesktopBridge, project: string): SessionFiles {
  return {
    read: (path) => guarded(path, () => bridge.call("files.read", { project, path })),
    write: (path, content, eol) =>
      guarded(path, () =>
        bridge.call(
          "files.write",
          eol === undefined ? { project, path, content } : { project, path, content, eol },
        ),
      ),
  };
}

export class EditorSessions {
  readonly #bridge: DesktopBridge;
  readonly #autosave: () => AutosaveMode;
  readonly #sessions = new Map<string, EditorSession>();

  constructor(bridge: DesktopBridge, autosave: () => AutosaveMode) {
    this.#bridge = bridge;
    this.#autosave = autosave;
  }

  get(project: string): EditorSession | undefined {
    return this.#sessions.get(project);
  }

  /** 取这个项目的会话，没有就建一个并开始恢复文件标签 */
  ensure(tab: Pick<TabRow, "id" | "entry">): EditorSession {
    const existing = this.#sessions.get(tab.id);
    if (existing !== undefined) return existing;
    const session = new EditorSession({
      files: sessionFilesFor(this.#bridge, tab.id),
      memory: localOpenFilesMemory(tab.id),
      autosave: this.#autosave,
    });
    this.#sessions.set(tab.id, session);
    void session.start(tab.entry);
    return session;
  }

  /** 只保留还开着的项目标签的会话 */
  retain(open: ReadonlySet<string>): void {
    for (const id of [...this.#sessions.keys()]) if (!open.has(id)) this.#sessions.delete(id);
  }
}
