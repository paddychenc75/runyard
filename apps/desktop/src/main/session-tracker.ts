import type { SavedSession, SessionStore } from "./controller-hosts.ts";
import { LIBRARY_TAB } from "./workspace-tabs.ts";

// 记住和恢复上次的标签页（规格 DESKTOP-WORKSPACE-51 至 54，PRD #prd-restore-tabs）。
// 标签页一有变化就记（不等退出：被强制结束也不丢）；恢复完成前、退出开始后不写，
// 否则空的初始状态或随道别停掉的运行会盖掉上次的记录。

export interface RestorePlan {
  /** 要开出来的标签页，按原顺序；只含仍在资源库里的项目 */
  tabs: string[];
  active: string;
  /** 上次在运行、这次要等切过去才启动的标签页 */
  pending: string[];
}

export class SessionTracker {
  readonly #store: SessionStore | undefined;
  #open = false;
  #frozen = false;
  #last = "";

  constructor(store: SessionStore | undefined) {
    this.#store = store;
  }

  async plan(known: ReadonlySet<string>): Promise<RestorePlan | null> {
    const saved = await this.#store?.load().catch(() => null);
    if (saved === null || saved === undefined) return null;
    const tabs = saved.tabs.filter((tab) => known.has(tab.id));
    const ids = tabs.map((tab) => tab.id);
    return {
      tabs: ids,
      active: ids.includes(saved.active) ? saved.active : LIBRARY_TAB,
      pending: tabs.filter((tab) => tab.running).map((tab) => tab.id),
    };
  }

  /** 恢复做完了，之后的变化才记 */
  open(): void {
    this.#open = true;
  }

  /** 退出开始：以后不再写 */
  freeze(): void {
    this.#frozen = true;
  }

  record(session: SavedSession): void {
    if (this.#store === undefined || !this.#open || this.#frozen) return;
    const json = JSON.stringify(session);
    if (json === this.#last) return;
    this.#last = json;
    void this.#store.save(session).catch(() => {
      this.#last = "";
    });
  }
}
