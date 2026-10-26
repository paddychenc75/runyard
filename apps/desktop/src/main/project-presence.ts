import type { Playground } from "@runyard/protocol";
import { Coalesced } from "./coalesced.ts";

type KnownProject = Pick<Playground, "id" | "path" | "missingSince">;

/** 只检查索引里的项目根目录；存在性发生变化才让管理进程重扫，不遍历项目树。 */
export class ProjectPresence {
  readonly #rows: () => readonly KnownProject[];
  readonly #exists: ((path: string) => Promise<boolean>) | undefined;
  readonly #rescan: () => Promise<void>;
  readonly #checking = new Coalesced(() => this.#check());
  readonly #ids = new Set<string>();
  #all = false;
  constructor(
    rows: () => readonly KnownProject[],
    exists: ((path: string) => Promise<boolean>) | undefined,
    rescan: () => Promise<void>,
  ) {
    this.#rows = rows;
    this.#exists = exists;
    this.#rescan = rescan;
  }
  check(id?: string): Promise<void> {
    if (id === undefined) this.#all = true;
    else this.#ids.add(id);
    return this.#checking.run();
  }
  async #check(): Promise<void> {
    const rows = this.#rows().filter((row) => this.#all || this.#ids.has(row.id));
    this.#all = false;
    this.#ids.clear();
    const exists = this.#exists;
    if (!exists) return;
    const results = await Promise.all(
      rows.map(async (row) => ({ row, exists: await exists(row.path) })),
    );
    const current = new Map(this.#rows().map((row) => [row.id, row]));
    // 等待 stat 时可能改过资源库或重新定位；旧路径的结果不能触发新位置的扫描。
    const changed = results.some(({ row, exists: present }) => {
      const now = current.get(row.id);
      return now?.path === row.path && present !== (now.missingSince === undefined);
    });
    if (changed) await this.#rescan();
  }
}
