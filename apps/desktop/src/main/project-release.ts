import type { ClientEvent } from "@runyard/client";
import type { LibraryClient, TerminalHooks } from "./controller-hosts.ts";

// 改名、移到废纸篓之前放掉项目的句柄（技术设计 §4.3 第 2、3 步）：先把编辑器未保存的修改写入磁盘，
// 再让终端连同里面的命令结束、编辑器的文件监听放掉。应用自己发起的（先放再交给管理进程）和管理进程请求的
// （命令行 `runyard rm`、自动清理、别的客户端的改名）走同一条路径；管理进程请求时放完要回报 playground.released，
// 不让它白等 3 秒。管理进程请求的没有地方询问用户，所以编辑器一律直接写入（规格 DESKTOP-EDITOR-75 至 78）。

export type ReleaseReason = "rename" | "trash";

/** 终端以外的那部分：编辑器的写入与文件监听（比控制器晚建，所以事后接） */
export interface ReleaseExtras {
  /** 把项目里未保存的修改写入；ask 为真时自动保存关着的先问用户。false = 用户取消 */
  closed?(id: string): Promise<void>;
  flush(id: string, ask: boolean): Promise<boolean>;
  release(id: string, reason: ReleaseReason): Promise<void>;
  /** 改名或移走没做成（或做完了）之后，把放掉的文件监听接回来 */
  restore(id: string): Promise<void>;
}

const NO_EXTRAS: ReleaseExtras = {
  flush: async () => true,
  release: async () => {},
  restore: async () => {},
};

/** 管理进程请求释放后，等它完成改名或移走多久；到时没等到事件也把监听接回来 */
export const RESTORE_FALLBACK_MS = 10_000;

export class ProjectRelease {
  readonly #client: LibraryClient;
  readonly #terminals: TerminalHooks | undefined;
  readonly #folderOf: (id: string) => string | null;
  #extras: ReleaseExtras = NO_EXTRAS;
  /** 管理进程请求释放、还没看到结果的项目：放掉时的文件夹 */
  readonly #awaiting = new Map<string, string | null>();

  constructor(
    client: LibraryClient,
    terminals: TerminalHooks | undefined,
    folderOf: (id: string) => string | null,
  ) {
    this.#client = client;
    this.#terminals = terminals;
    this.#folderOf = folderOf;
  }

  onExtras(extras: ReleaseExtras): void {
    this.#extras = extras;
  }

  /** 标签关了或项目没了：终端和里面的命令一起结束（规格 DESKTOP-TERMINAL-27） */
  tabClosed(id: string): void {
    void this.#extras.closed?.(id).catch(() => undefined);
    void this.#terminals?.end(id, "closed").catch(() => undefined);
  }

  /** 终端里正在运行的命令；空闲或没有终端是 null（关标签页要不要确认靠它） */
  async runningCommand(id: string): Promise<string | null> {
    return (await this.#terminals?.runningCommand(id)) ?? null;
  }

  /** 应用里改名、移走之前：未保存的修改先写入（自动保存关着的先问）。false = 用户取消，什么都不要做 */
  flush(id: string): Promise<boolean> {
    return this.#extras.flush(id, true);
  }

  async release(id: string, reason: ReleaseReason): Promise<void> {
    await Promise.all([
      this.#terminals?.end(id, reason === "rename" ? "renamed" : "trashed"),
      this.#extras.release(id, reason),
    ]);
  }

  restore(id: string): Promise<void> {
    return this.#extras.restore(id);
  }

  /**
   * 管理进程的事件（同时负责重读数据）：请求释放就先写入再放掉；项目的记录变了（改名）或没了（移走）
   * 说明它做完了，数据重读之后把监听接回来（接监听要查项目的新文件夹）
   */
  onEvent(event: ClientEvent, refresh: () => Promise<void>): void {
    if (event.event === "playground.releaseRequested") {
      void this.answer(event.data.playgroundId, event.data.reason);
    } else if (event.event === "playground.removed") {
      this.#awaiting.delete(event.data.playgroundId);
    }
    const changed = event.event === "playground.changed" ? event.data : null;
    void refresh().then(() => {
      if (
        changed !== null &&
        this.#awaiting.has(changed.id) &&
        changed.path !== this.#awaiting.get(changed.id)
      ) {
        return this.#finish(changed.id);
      }
    });
  }

  /** 管理进程请求释放：放掉之后回报；放不掉也要回报，管理进程继续往下走，占用会以 PATH_LOCKED 报出来 */
  async answer(id: string, reason: ReleaseReason): Promise<void> {
    this.#awaiting.set(id, this.#folderOf(id));
    setTimeout(() => void this.#finish(id), RESTORE_FALLBACK_MS).unref?.();
    // 没有地方询问用户：直接写入，任何一档自动保存都不丢修改（DESKTOP-EDITOR-78）；写不进去也继续放掉
    await this.#extras.flush(id, false).catch(() => undefined);
    await this.release(id, reason).catch(() => undefined);
    await this.#client.call("playground.released", { playgroundId: id }).catch(() => undefined);
  }

  async #finish(id: string): Promise<void> {
    if (!this.#awaiting.delete(id)) return;
    await this.#extras.restore(id).catch(() => undefined);
  }
}
