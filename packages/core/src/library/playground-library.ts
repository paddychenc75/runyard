import { basename, join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import type { LibraryEntry } from "@runyard/protocol";
import { type CreateContext, createPlayground } from "./create-playground.ts";
import { randomUlid } from "./create-ulid.ts";
import { libraryError } from "./library-error.ts";
import { LibraryIndex, libraryIndexPath } from "./library-index.ts";
import type {
  CreatePlaygroundRequest,
  CreatePlaygroundResult,
  LibraryItem,
  PlaygroundSeed,
  PortSlotAllocator,
  ScanReport,
} from "./library-types.ts";
import { readPlaygroundFile } from "./playground-file-io.ts";
import { scanLibrary } from "./scan-library.ts";

export type PlaygroundLibraryDeps = {
  /** 资源库根目录（设置里的 libraryRoot） */
  readonly root: AbsPath;
  readonly platform: Pick<Platform, "paths" | "fs">;
  readonly ports: PortSlotAllocator;
  readonly now: () => number;
  /** 缺省生成 ULID；测试给固定序列 */
  readonly newId?: () => string;
};

// 资源库：索引加上“文件夹被动过”的判断。改名、移到废纸篓、自动清理不在这里（#38），
// 文件锁和原子写入的编排属于 supervisor（#41）。
export class PlaygroundLibrary {
  readonly #deps: PlaygroundLibraryDeps;
  readonly #index: LibraryIndex;

  private constructor(deps: PlaygroundLibraryDeps, index: LibraryIndex) {
    this.#deps = deps;
    this.#index = index;
  }

  /** 读索引；索引不存在或坏了（坏文件已改名留存）就从磁盘重建（规格 LIBRARY-PLAYGROUNDS-30） */
  static async open(deps: PlaygroundLibraryDeps): Promise<PlaygroundLibrary> {
    const path = libraryIndexPath(deps.platform.paths.stateDir);
    const { index, state } = await LibraryIndex.load(
      { platform: deps.platform, now: deps.now },
      path,
      deps.root,
    );
    const library = new PlaygroundLibrary(deps, index);
    if (state === "absent" || state === "recovered") await library.rescan();
    return library;
  }

  list(): readonly LibraryItem[] {
    return this.#index.entries().map((entry) => ({ name: basename(entry.path), entry }));
  }

  /** 按 id 或名称找；找不到返回 undefined */
  find(ref: string): LibraryItem | undefined {
    return this.list().find((item) => item.entry.id === ref || item.name === ref);
  }

  /** 要对项目的文件夹做事（运行、移到废纸篓）之前的关卡：找不到文件夹报 FOLDER_MISSING */
  requireFolder(ref: string): LibraryItem {
    const item = this.find(ref);
    if (!item) throw libraryError("PLAYGROUND_NOT_FOUND", { name: ref }, `no playground ${ref}`);
    if (item.entry.missingSince !== undefined)
      throw libraryError(
        "FOLDER_MISSING",
        { name: item.name },
        `folder missing since ${item.entry.missingSince}`,
      );
    return item;
  }

  async create(
    seed: PlaygroundSeed,
    request: CreatePlaygroundRequest,
  ): Promise<CreatePlaygroundResult> {
    return createPlayground(this.#context(), seed, request);
  }

  /** 扫描根目录并落盘索引；返回的变化由 supervisor 发成 playground.* 事件 */
  async rescan(): Promise<ScanReport> {
    const report = await scanLibrary(this.#context());
    await this.#index.save(this.#deps.root);
    return report;
  }

  /** 重新定位：指向任意位置的文件夹，里面的 id 必须对得上（规格 LIBRARY-PLAYGROUNDS-28） */
  async relocate(ref: string, path: AbsPath): Promise<LibraryEntry> {
    this.#index.assertWritable();
    const item = this.find(ref);
    if (!item) throw libraryError("PLAYGROUND_NOT_FOUND", { name: ref }, `no playground ${ref}`);
    const read = await readPlaygroundFile(this.#deps.platform.fs, absPath(join(path)));
    const same =
      (read.status === "ok" && read.value.id === item.entry.id) ||
      (read.status === "newer" && read.id === item.entry.id);
    if (!same)
      throw libraryError(
        "PLAYGROUND_NOT_FOUND",
        { name: ref },
        "folder has no matching playground id",
      );
    const { missingSince: _gone, ...rest } = item.entry;
    const entry: LibraryEntry = { ...rest, path };
    this.#index.replace(entry);
    await this.#index.save(this.#deps.root);
    return entry;
  }

  #context(): CreateContext {
    const { root, platform, ports, now, newId } = this.#deps;
    return {
      root,
      platform,
      ports,
      now,
      index: this.#index,
      newId: newId ?? (() => randomUlid(now())),
    };
  }
}
