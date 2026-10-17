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

  async #guard(id: string, action: () => Promise<void>): Promise<EditResult> {
    if (this.#hooks.busy.has(id)) return { ok: false, error: { code: "BUSY", params: {} } };
    this.#hooks.busy.add(id);
    this.#hooks.emit();
    try {
      await action();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: toDesktopError(error) };
    } finally {
      this.#hooks.busy.delete(id);
      await this.#hooks.refresh();
    }
  }
}
