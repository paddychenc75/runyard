import { basename, dirname, join } from "node:path";
import type { AbsPath, Platform } from "@runyard/platform";
import { absPath } from "@runyard/platform";
import {
  LIBRARY_FILE_VERSION,
  type LibraryEntry,
  type LibraryFile,
  libraryEntrySchema,
  libraryFileFormat,
  quarantineFileName,
  readVersionedText,
  serializeVersioned,
} from "@runyard/protocol";
import { libraryError } from "./library-error.ts";

// 本机索引 state/library.json（storage.md 2.2）。端口登记表就是各项的 port。
// 写入前一律先确认文件不是更新版本写的；未知字段（顶层和每一项）随解析结果原样带回去。

export type IndexLoadState =
  /** 读到了，可以写 */
  | "ok"
  /** 文件不存在 */
  | "absent"
  /** 文件坏了：已改名留存，按空索引重来，调用方要重扫 */
  | "recovered"
  /** 更新版本写的：只读 */
  | "newer";

export function libraryIndexPath(stateDir: AbsPath): AbsPath {
  return absPath(join(stateDir, "state", "library.json"));
}

type IndexDeps = {
  readonly platform: Pick<Platform, "fs">;
  readonly now: () => number;
};

export class LibraryIndex {
  readonly #deps: IndexDeps;
  readonly #path: AbsPath;
  #file: LibraryFile;
  readonly #newer: { found: number; supported: number } | null;
  #dirty: boolean;

  private constructor(
    deps: IndexDeps,
    path: AbsPath,
    file: LibraryFile,
    newer: { found: number; supported: number } | null,
    dirty: boolean,
  ) {
    this.#deps = deps;
    this.#path = path;
    this.#file = file;
    this.#newer = newer;
    this.#dirty = dirty;
  }

  static async load(
    deps: IndexDeps,
    path: AbsPath,
    root: AbsPath,
  ): Promise<{ index: LibraryIndex; state: IndexLoadState }> {
    const empty: LibraryFile = { formatVersion: LIBRARY_FILE_VERSION, root, playgrounds: [] };
    const text = await deps.platform.fs.readText(path);
    if (text === null)
      return { index: new LibraryIndex(deps, path, empty, null, true), state: "absent" };
    const result = readVersionedText(libraryFileFormat, text);
    if (result.status === "ok") {
      // 旧版本读入后在内存里升到最新，下次写入才落盘
      const dirty = result.upgradedFrom !== undefined;
      return { index: new LibraryIndex(deps, path, result.value, null, dirty), state: "ok" };
    }
    if (result.status === "newer") {
      const raw = Array.isArray(result.raw.playgrounds) ? result.raw.playgrounds : [];
      const playgrounds = raw.flatMap((item) => {
        const parsed = libraryEntrySchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
      const view: LibraryFile = { ...empty, playgrounds };
      const newer = { found: result.fileVersion, supported: result.supportedVersion };
      return { index: new LibraryIndex(deps, path, view, newer, false), state: "newer" };
    }
    // 坏文件改名留存，不删：索引是本机状态，丢了能从磁盘重建，但留着方便排查
    const quarantined = join(dirname(path), quarantineFileName(basename(path), deps.now()));
    await deps.platform.fs.renameFile(path, absPath(quarantined));
    return { index: new LibraryIndex(deps, path, empty, null, true), state: "recovered" };
  }

  entries(): readonly LibraryEntry[] {
    return this.#file.playgrounds;
  }

  byId(id: string): LibraryEntry | undefined {
    return this.#file.playgrounds.find((entry) => entry.id === id);
  }

  byPath(path: string): LibraryEntry | undefined {
    return this.#file.playgrounds.find((entry) => entry.path === path);
  }

  takenPorts(): Set<number> {
    const ports = new Set<number>();
    for (const entry of this.#file.playgrounds) if (entry.port !== undefined) ports.add(entry.port);
    return ports;
  }

  isReadOnly(): boolean {
    return this.#newer !== null;
  }

  /** 写之前的统一关卡：更新版本写的文件不改写、不降级 */
  assertWritable(): void {
    if (this.#newer === null) return;
    throw libraryError(
      "DATA_FROM_NEWER_VERSION",
      { file: "library.json", found: this.#newer.found, supported: this.#newer.supported },
      "library.json was written by a newer version",
    );
  }

  add(entry: LibraryEntry): void {
    this.assertWritable();
    this.#file = { ...this.#file, playgrounds: [...this.#file.playgrounds, entry] };
    this.#dirty = true;
  }

  /** 整项替换（用展开保住未知字段）；找不到 id 是缺陷 */
  replace(entry: LibraryEntry): void {
    this.assertWritable();
    const index = this.#file.playgrounds.findIndex((item) => item.id === entry.id);
    if (index < 0) throw libraryError("INTERNAL", {}, `no index entry with id ${entry.id}`);
    const playgrounds = [...this.#file.playgrounds];
    playgrounds[index] = entry;
    this.#file = { ...this.#file, playgrounds };
    this.#dirty = true;
  }

  /** 移出索引（移到废纸篓之后）；找不到 id 是缺陷 */
  remove(id: string): void {
    this.assertWritable();
    if (!this.byId(id)) throw libraryError("INTERNAL", {}, `no index entry with id ${id}`);
    this.#file = { ...this.#file, playgrounds: this.#file.playgrounds.filter((e) => e.id !== id) };
    this.#dirty = true;
  }

  /** 有改动才落盘；root 跟随当前资源库根目录 */
  async save(root: AbsPath): Promise<void> {
    this.assertWritable();
    if (!this.#dirty) return;
    const text = serializeVersioned(libraryFileFormat, { ...this.#file, root });
    await this.#deps.platform.fs.makeDir(absPath(dirname(this.#path)));
    await this.#deps.platform.fs.writeAtomic(this.#path, text);
    this.#file = { ...this.#file, root };
    this.#dirty = false;
  }
}
