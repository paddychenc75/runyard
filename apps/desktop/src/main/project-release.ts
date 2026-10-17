import type { LibraryClient, TerminalHooks } from "./controller-hosts.ts";

// 改名、移到废纸篓之前放掉项目的句柄（技术设计 §4.3 第 2、3 步）：终端连同里面的命令结束，
// 编辑器的文件监听放掉。应用自己发起的（先放再交给管理进程）和管理进程请求的（命令行 `runyard rm`、别的客户端的改名）
// 走同一条路径；管理进程请求时放完要回报 playground.released，不让它白等 3 秒。

export type ReleaseReason = "rename" | "trash";

export class ProjectRelease {
  readonly #client: LibraryClient;
  readonly #terminals: TerminalHooks | undefined;
  /** 终端以外要放掉的东西（文件监听）；比控制器晚建，所以事后接 */
  #extras: (id: string, reason: ReleaseReason) => Promise<void> = async () => {};

  constructor(client: LibraryClient, terminals: TerminalHooks | undefined) {
    this.#client = client;
    this.#terminals = terminals;
  }

  onExtras(release: (id: string, reason: ReleaseReason) => Promise<void>): void {
    this.#extras = release;
  }

  /** 标签关了或项目没了：终端和里面的命令一起结束（规格 DESKTOP-TERMINAL-27） */
  tabClosed(id: string): void {
    void this.#terminals?.end(id, "closed").catch(() => undefined);
  }

  /** 终端里正在运行的命令；空闲或没有终端是 null（关标签页要不要确认靠它） */
  async runningCommand(id: string): Promise<string | null> {
    return (await this.#terminals?.runningCommand(id)) ?? null;
  }

  async release(id: string, reason: ReleaseReason): Promise<void> {
    await Promise.all([
      this.#terminals?.end(id, reason === "rename" ? "renamed" : "trashed"),
      this.#extras(id, reason),
    ]);
  }

  /** 管理进程请求释放：放掉之后回报；放不掉也要回报，管理进程继续往下走，占用会以 PATH_LOCKED 报出来 */
  async answer(id: string, reason: ReleaseReason): Promise<void> {
    try {
      await this.release(id, reason);
    } catch {
      // 见上
    }
    await this.#client.call("playground.released", { playgroundId: id }).catch(() => undefined);
  }
}
