import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SavedSession, SessionStore } from "./controller-hosts.ts";

// 上次的标签页存在应用自己的数据目录里的一个小文件（用户数据目录，指定 --root 时在 <root>/.runyard/app-data）：
// 它只是界面状态，不属于资源库，也不是管理进程的数据，命令行用不到（规格 DESKTOP-WORKSPACE-51）。

function parse(raw: string): SavedSession | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { tabs, active } = value as Record<string, unknown>;
  if (!Array.isArray(tabs) || typeof active !== "string") return null;
  const parsed: SavedSession["tabs"] = [];
  for (const tab of tabs) {
    if (typeof tab !== "object" || tab === null) return null;
    const { id, running } = tab as Record<string, unknown>;
    if (typeof id !== "string" || id === "" || typeof running !== "boolean") return null;
    if (!parsed.some((existing) => existing.id === id)) parsed.push({ id, running });
  }
  return { tabs: parsed, active };
}

export class FileSessionStore implements SessionStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  /** 没有、读不了或内容不对都当作没有记录 */
  async load(): Promise<SavedSession | null> {
    try {
      return parse(await readFile(this.#file, "utf8"));
    } catch {
      return null;
    }
  }

  /** 先写同目录的临时文件再改名：中途被结束也不会留下写了一半的记录 */
  async save(session: SavedSession): Promise<void> {
    await mkdir(dirname(this.#file), { recursive: true });
    const temp = `${this.#file}.tmp`;
    await writeFile(temp, JSON.stringify(session), "utf8");
    await rename(temp, this.#file);
  }
}
