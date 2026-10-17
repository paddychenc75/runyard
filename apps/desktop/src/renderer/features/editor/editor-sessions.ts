import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { EditorFileResult } from "../../../shared/editor-files.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { watchProject } from "../../shared/project-watch.ts";
import { EditorSession } from "./editor-session.ts";
import { localOpenFilesMemory } from "./local-open-files-memory.ts";
import type { AutosaveMode, SessionFiles } from "./session-types.ts";

// 每个打开着的项目标签一个编辑会话：切到别的标签再切回来，未保存的修改和选中的文件都还在。
// 项目标签被关掉，它的会话随之丢弃；关之前先 flushProject 写入或询问（DESKTOP-EDITOR-27），退出前 flushAll（DESKTOP-EDITOR-28）。

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
    watch: (listener) => watchProject(bridge, project, (payload) => listener(payload.changes)),
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
    for (const [id, session] of [...this.#sessions]) {
      if (open.has(id)) continue;
      session.dispose();
      this.#sessions.delete(id);
    }
  }

  /** 关闭这个项目标签页之前：未保存的修改先写入（自动保存关着的先问）。false = 中止关闭 */
  async flushProject(id: string): Promise<boolean> {
    const session = this.#sessions.get(id);
    if (session === undefined) return true;
    if (session.mayAsk()) await this.#bridge.call("tab.select", id);
    return session.flushForClose();
  }

  /** 退出应用之前：每个项目依次来，要问用户的先切到那个项目标签页让询问看得见。false = 中止退出 */
  async flushAll(): Promise<boolean> {
    for (const [id, session] of [...this.#sessions]) {
      if (session.mayAsk()) await this.#bridge.call("tab.select", id);
      if (!(await session.flushForClose())) return false;
    }
    return true;
  }
}
