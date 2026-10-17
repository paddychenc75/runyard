import type { RunSnapshot } from "@runyard/protocol";
import { isActiveRun, latestRunByPlayground } from "./build-library-state.ts";
import type { LibraryClient } from "./controller-hosts.ts";

// 命令行持有的运行在标签页里只是被“查看”（规格 DESKTOP-WORKSPACE-46、48）：
// 不重启、不改持有者，向管理进程登记一次 run.attach，这样查看不算空闲活动。

/** 这个项目最近一次运行是命令行持有且仍在进行 */
export function heldByCli(playgroundId: string, runs: readonly RunSnapshot[]): RunSnapshot | null {
  const run = latestRunByPlayground(runs).get(playgroundId);
  return run !== undefined && run.owner.kind === "cli" && isActiveRun(run.state) ? run : null;
}

export class CliView {
  readonly #client: LibraryClient;
  readonly #clientId: string;
  /** 已登记查看的运行（项目 id → 运行 id） */
  readonly #attached = new Map<string, string>();

  constructor(client: LibraryClient, clientId: string) {
    this.#client = client;
    this.#clientId = clientId;
  }

  /** 打开着标签页的项目里，命令行持有的都登记查看；不再是命令行持有的记录作废。登记失败不打扰 */
  async sync(tabIds: readonly string[], runs: readonly RunSnapshot[]): Promise<void> {
    for (const id of tabIds) {
      const held = heldByCli(id, runs);
      if (held === null) {
        this.#attached.delete(id);
      } else if (this.#attached.get(id) !== held.runId) {
        this.#attached.set(id, held.runId);
        await this.#client
          .call("run.attach", { runId: held.runId, clientId: this.#clientId })
          .catch(() => this.#attached.delete(id));
      }
    }
  }

  forget(playgroundId: string): void {
    this.#attached.delete(playgroundId);
  }

  /** “改为由我管理”（规格 DESKTOP-WORKSPACE-49）：持有者从命令行改为这个项目的标签页，运行不重启 */
  async adopt(run: RunSnapshot): Promise<void> {
    await this.#client.call("run.adopt", {
      runId: run.runId,
      owner: { kind: "tab", clientId: this.#clientId, tabId: `tab-${run.playgroundId}` },
    });
    this.forget(run.playgroundId);
  }
}
