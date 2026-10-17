import type { Notice, Playground, RunSnapshot } from "@runyard/protocol";
import type { LibraryState, LinkConfirmView, UpdateBannerView } from "../shared/library-state.ts";
import { AgentNotices } from "./agent-notices.ts";
import { CleanReminders, type CleanRemindersHooks } from "./clean-reminders.ts";
import type { DockBadge, LibraryControllerOptions } from "./controller-hosts.ts";
import { readLibraryRoot } from "./library-root.ts";

// 资源库页周围的几样东西，从控制器里分出来：资源库文件夹的显示写法和是否在同步目录下、
// 自动清理的提醒（CleanReminders）、右下角的提示（AgentNotices）、Dock 角标。
export class LibraryChrome {
  readonly clean: CleanReminders;
  readonly notices = new AgentNotices();
  readonly #options: LibraryControllerOptions;
  readonly #now: () => number;
  readonly #dock: DockBadge | undefined;
  /** 待确认的 runyard://new 请求和“有新版本”提示（links/、updates/ 设置它们） */
  linkConfirm: LinkConfirmView | null = null;
  update: UpdateBannerView | null = null;
  #root = "";
  #synced = false;
  #badge = -1;
  readonly #emit: () => void;

  constructor(options: LibraryControllerOptions, hooks: CleanRemindersHooks) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#dock = options.dock;
    this.#emit = hooks.emit;
    this.clean = new CleanReminders(options.client, hooks);
  }

  /** 启动时：让管理进程先扫一遍，文件夹被挪走的项目才在列表里看得到“找不到文件夹”（规格 DESKTOP-LIBRARY-VIEW-49）；扫不了不影响打开 */
  async start(): Promise<void> {
    await this.readRoot();
    await this.#options.client.call("library.rescan", {}).catch(() => undefined);
  }

  /** 读设置里的资源库文件夹：显示写法，和它是否在 iCloud、Dropbox 这类同步目录下（新建弹窗给警告） */
  async readRoot(): Promise<void> {
    const { client, home, isCloudSynced } = this.#options;
    const { display, raw } = await readLibraryRoot(client, home);
    this.#root = display;
    this.#synced = raw !== "" && (isCloudSynced?.(raw) ?? false);
  }

  /** 交给 buildLibraryState 的那几项 */
  inputs() {
    return {
      libraryRoot: this.#root,
      libraryRootSynced: this.#synced,
      now: this.#now(),
      cleanLater: this.clean.laterIds,
      notices: this.notices.list(),
      linkConfirm: this.linkConfirm,
      update: this.update,
    };
  }

  observe(playgrounds: readonly Playground[], runs: readonly RunSnapshot[]): void {
    this.notices.observe(playgrounds, runs, this.#now());
  }

  /** 创建成功带回的提示：路径接近系统上限（规格 LIBRARY-PLAYGROUNDS-05） */
  created(name: string, notices: readonly Notice[]): void {
    for (const notice of notices) {
      if (notice.code === "PATH_NEAR_LIMIT")
        this.notices.addPathNearLimit(name, notice.params.length, notice.params.limit);
    }
  }

  /** 链接和更新检查改了自己的状态后，把新状态推给界面 */
  changed(): void {
    this.#emit();
  }

  dismissNotice(id: string): void {
    this.notices.dismiss(id);
    this.#emit();
  }

  /** 状态每次推给界面时调用：待清理的数量变了就更新 Dock 角标（规格 DESKTOP-LIBRARY-VIEW-57、58） */
  publish(state: LibraryState): void {
    const due = state.cleanDueCount ?? 0;
    if (due === this.#badge) return;
    this.#badge = due;
    this.#dock?.set(due);
  }
}
