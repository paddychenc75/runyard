import type { DuplicateResult, EditRequest, EditResult } from "../shared/desktop-bridge.ts";
import { toDesktopError } from "./desktop-error.ts";
import type { LibraryClient } from "./library-controller.ts";

// 资源库行和工作区“更多”菜单里的改动：重命名、备注、自动清理、创建副本（#182）。
// 失败不抛、不写全局错误：原样交回，由各自的表单显示（规格 DESKTOP-LIBRARY-VIEW-35、39）。

export interface EditHooks {
  /** 正在等管理进程回应的项目 id：行上的按钮暂时不可点 */
  busy: Set<string>;
  emit: () => void;
  refresh: () => Promise<void>;
  /** 当前资源库里这个项目的名称和备注；找不到是 undefined */
  current: (id: string) => { name: string; note?: string | undefined } | undefined;
  /** 去掉项目的标签页（预览、控制台一并放掉），不碰运行 */
  dropTab: (id: string) => void;
  chooseFolder: (defaultPath: string) => Promise<string | null>;
  folderOf: (id: string) => string | null;
  /** 改名、移到废纸篓之前放掉项目的句柄：终端结束、文件监听放掉（技术设计 §4.3）；做完才兑现 */
  releaseProject: (id: string, reason: "rename" | "trash") => Promise<void>;
}

/** 管理进程回应“没有移走”（trashed 为 false）：当作废纸篓不可用 */
class TrashRefused extends Error {
  readonly playgroundName: string;

  constructor(playgroundName: string) {
    super("trash refused");
    this.playgroundName = playgroundName;
  }
}

export class PlaygroundEdits {
  readonly #client: LibraryClient;
  readonly #hooks: EditHooks;
  constructor(client: LibraryClient, hooks: EditHooks) {
    this.#client = client;
    this.#hooks = hooks;
  }

  /**
   * 名称变了：管理进程先停止运行、改名、再用新名称启动（持有者和端口不变）；
   * 名称没变只改备注，运行不受影响。改名失败时备注也不动，行保持原样。
   */
  async edit(request: EditRequest): Promise<EditResult> {
    const before = this.#hooks.current(request.id);
    if (before === undefined)
      return { ok: false, error: { code: "PLAYGROUND_NOT_FOUND", params: {} } };
    return this.#guard(request.id, async () => {
      if (request.name !== before.name) {
        // 终端要先结束再改名：它的工作目录不能停在一个已不存在的文件夹里（规格 DESKTOP-TERMINAL-34）
        await this.#hooks.releaseProject(request.id, "rename");
        await this.#client.call("playground.rename", {
          playground: request.id,
          newName: request.name,
        });
      }
      if (request.note !== (before.note ?? "")) {
        await this.#client.call("playground.update", {
          playground: request.id,
          note: request.note,
        });
      }
    });
  }

  autoClean(id: string, days: number | null): Promise<EditResult> {
    return this.#guard(id, async () => {
      await this.#client.call("playground.update", { playground: id, autoClean: days });
    });
  }

  async duplicate(id: string): Promise<DuplicateResult> {
    let copyId = "";
    const result = await this.#guard(id, async () => {
      copyId = (await this.#client.call("playground.duplicate", { playground: id })).id;
    });
    return result.ok ? { ok: true, id: copyId } : result;
  }

  /**
   * 移到废纸篓（规格 DESKTOP-LIBRARY-VIEW-43 至 45；#183）：先关标签页、放掉文件监听，
   * 再交给管理进程（它先停止运行、走释放顺序、只经平台层移动）。从不永久删除：
   * 放不进废纸篓或被占用就失败，项目留在列表里、文件夹留在原处。
   */
  async trash(id: string): Promise<EditResult> {
    const before = this.#hooks.current(id);
    if (before === undefined)
      return { ok: false, error: { code: "PLAYGROUND_NOT_FOUND", params: {} } };
    return this.#guard(id, async () => {
      this.#hooks.dropTab(id);
      await this.#hooks.releaseProject(id, "trash");
      const outcome = await this.#client.call("playground.trash", { playground: id });
      if (!outcome.trashed) throw new TrashRefused(before.name);
    });
  }

  /** 找不到文件夹的项目：只从资源库去掉这一项，不动磁盘（规格 DESKTOP-LIBRARY-VIEW“找不到项目文件夹”） */
  forget(id: string): Promise<EditResult> {
    return this.#guard(id, async () => {
      this.#hooks.dropTab(id);
      await this.#client.call("playground.forget", { playground: id });
    });
  }

  /** 选一个文件夹重新定位；对不对得上由管理进程判，取消什么都不做 */
  async relocate(id: string): Promise<EditResult> {
    const chosen = await this.#hooks.chooseFolder(this.#hooks.folderOf(id) ?? "");
    if (chosen === null) return { ok: true };
    return this.#guard(id, async () => {
      await this.#client.call("playground.relocate", { playground: id, path: chosen });
    });
  }

  async #guard(id: string, action: () => Promise<void>): Promise<EditResult> {
    if (this.#hooks.busy.has(id)) return { ok: false, error: { code: "BUSY", params: {} } };
    this.#hooks.busy.add(id);
    this.#hooks.emit();
    try {
      await action();
      return { ok: true };
    } catch (error) {
      if (error instanceof TrashRefused) {
        return {
          ok: false,
          error: { code: "TRASH_UNAVAILABLE", params: { name: error.playgroundName } },
        };
      }
      return { ok: false, error: toDesktopError(error) };
    } finally {
      this.#hooks.busy.delete(id);
      await this.#hooks.refresh();
    }
  }
}
