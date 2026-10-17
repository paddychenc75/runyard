import type { EditResult } from "../shared/desktop-bridge.ts";
import type { DesktopError } from "../shared/library-state.ts";
import type { LibraryClient } from "./controller-hosts.ts";
import { toDesktopError } from "./desktop-error.ts";

export interface CleanRemindersHooks {
  refresh(): Promise<void>;
  emit(): void;
  setError(error: DesktopError | null): void;
  /** 移到废纸篓：和命令行 rm 同一条路径（先关标签页，管理进程负责停止和移动） */
  trash(id: string): Promise<EditResult>;
}

// 自动清理的提醒与调度（规格 DESKTOP-LIBRARY-VIEW-57 至 60，library/auto-clean）：
// 提示条的名单和角标数在 build-library-state 里按时间算；这里管用户的三个选择、
// “提醒已显示”的回报，以及到点向管理进程要“可以清理”的清单。
export class CleanReminders {
  readonly #client: LibraryClient;
  readonly #hooks: CleanRemindersHooks;
  /** 点了“稍后再说”的项目：到下次打开应用前提示条不再列它们（本次启动内有效，不落盘） */
  readonly laterIds = new Set<string>();
  /** 已向管理进程回报“提醒已显示”的项目：回报过的不重复 */
  readonly #acked = new Set<string>();

  constructor(client: LibraryClient, hooks: CleanRemindersHooks) {
    this.#client = client;
    this.#hooks = hooks;
  }

  /** “改为保留”（规格 59）：列出的项目都变为已保留，提示条、行标签和角标随之消失 */
  async keep(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.#client.call("clean.keep", { playgroundId: id }).catch((error: unknown) => {
        this.#hooks.setError(toDesktopError(error));
      });
      this.laterIds.delete(id);
    }
    await this.#hooks.refresh();
  }

  /** “稍后再说”（规格 60）：只收起提示条，行标签和角标保留，清理照常按规则进行 */
  later(ids: readonly string[]): void {
    for (const id of ids) this.laterIds.add(id);
    this.#hooks.emit();
  }

  /**
   * 提示条真的显示出来了，回报“提醒已显示”（规格 58）：界面只在窗口可见时调用；
   * 窗口关着（应用在后台）时只有角标，没有这一步，管理进程就不会开始计 24 小时
   */
  async shown(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      if (this.#acked.has(id)) continue;
      this.#acked.add(id);
      await this.#client.call("clean.ackReminder", { playgroundId: id }).catch(() => {
        this.#acked.delete(id);
      });
    }
  }

  /**
   * 一轮检查（技术设计 §2.1：调度在主进程）：问管理进程哪些可以清理，逐个移到废纸篓；
   * 再重读，让角标和提示条跟上时间。管理进程不可达时什么都不做
   */
  async check(): Promise<void> {
    try {
      const { clean } = await this.#client.call("clean.due", {});
      for (const id of clean) await this.#hooks.trash(id);
    } catch {
      return;
    }
    await this.#hooks.refresh();
  }
}
