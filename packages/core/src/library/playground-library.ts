import { basename, join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import type { LibraryEntry } from "@runyard/protocol";
import { type AutoCleanCandidate, type AutoCleanVerdict, judgeAutoClean } from "./auto-clean.ts";
import { type CreateContext, createPlayground } from "./create-playground.ts";
import { randomUlid } from "./create-ulid.ts";
import { duplicatePlayground } from "./duplicate-playground.ts";
import { libraryError } from "./library-error.ts";
import { LibraryIndex, libraryIndexPath } from "./library-index.ts";
import {
  type OperationContext,
  type RenameHooks,
  type RenameResult,
  renamePlayground,
  type TrashHooks,
  type TrashOutcome,
  trashPlayground,
  writeAutoClean,
} from "./library-operations.ts";
import type {
  CreatePlaygroundRequest,
  CreatePlaygroundResult,
  LibraryItem,
  PlaygroundSeed,
  PortSlotAllocator,
  ScanReport,
} from "./library-types.ts";
import { type PlaygroundFileRead, readPlaygroundFile } from "./playground-file-io.ts";
import { scanLibrary } from "./scan-library.ts";
import { type PlaygroundEdits, updatePlaygroundFile } from "./update-playground.ts";

export type PlaygroundLibraryDeps = {
  /** 资源库根目录（设置里的 libraryRoot） */
  readonly root: AbsPath;
  readonly platform: Pick<Platform, "paths" | "fs">;
  readonly ports: PortSlotAllocator;
  readonly now: () => number;
  /** 缺省生成 ULID；测试给固定序列 */
  readonly newId?: () => string;
};

// 资源库：索引、“文件夹被动过”的判断、改名、移到废纸篓、自动清理的判断与计时状态。
// 停止运行、释放句柄的编排、文件锁和调度属于 supervisor（#41）。
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

  /**
   * 按 id、名称或文件夹的绝对路径找（规格 CLI-COMMANDS-43）；找不到返回 undefined。
   * 名称里不会有路径分隔符，所以绝对路径和名称不会混淆
   */
  find(ref: string): LibraryItem | undefined {
    // 与索引里的写法一致（join 归一化分隔符），去掉结尾的分隔符；不用 isAbsolute/resolve：它们随运行系统变，
    // 而测试里的假路径在 Windows 上没有盘符
    const folder = /^(?:[A-Za-z]:)?[\\/]/.test(ref) ? join(ref).replace(/[\\/]+$/, "") : undefined;
    return this.list().find(
      (item) => item.entry.id === ref || item.name === ref || item.entry.path === folder,
    );
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

  /** 创建副本（playground.duplicate）：不复制依赖目录，不运行 */
  async duplicate(ref: string, request: { name?: string } = {}): Promise<CreatePlaygroundResult> {
    return duplicatePlayground(this.#context(), this.requireFolder(ref), request);
  }

  /** 扫描根目录并落盘索引；返回的变化由 supervisor 发成 playground.* 事件 */
  async rescan(): Promise<ScanReport> {
    const report = await scanLibrary(this.#context());
    await this.#index.save(this.#deps.root);
    return report;
  }

  /** 读项目文件夹里的 playground.json（协议里的 Playground 要合并它和索引）；不报错，状态在返回值里 */
  async readFile(item: LibraryItem): Promise<PlaygroundFileRead> {
    return readPlaygroundFile(this.#deps.platform.fs, absPath(item.entry.path));
  }

  /** 改备注、脚本自动运行（playground.update）；自动清理走 setAutoClean */
  async update(ref: string, edits: PlaygroundEdits): Promise<LibraryItem> {
    this.#index.assertWritable();
    const item = this.requireFolder(ref);
    await updatePlaygroundFile(this.#operations(), item, edits);
    return item;
  }

  /** 从资源库移除，不动磁盘（playground.forget）；文件夹下次扫描会作为新项目被重新登记 */
  async forget(ref: string): Promise<LibraryItem> {
    this.#index.assertWritable();
    const item = this.#known(ref);
    this.#index.remove(item.entry.id);
    await this.#index.save(this.#deps.root);
    return item;
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

  /** 改名（技术设计 §4.3 固定顺序的第 5 步）；停止、释放、改名后重新启动由调用方经 hooks 编排 */
  async rename(ref: string, newName: string, hooks: RenameHooks): Promise<RenameResult> {
    return renamePlayground(this.#operations(), this.requireFolder(ref), newName, hooks);
  }

  /** 移到废纸篓（`rm` 与自动清理共用）；只经平台层 fs.trash，失败时项目原样保留 */
  async trash(ref: string, hooks: TrashHooks): Promise<TrashOutcome> {
    return trashPlayground(this.#operations(), this.requireFolder(ref), hooks);
  }

  /**
   * 自动清理的一轮检查（clean.due 的实现）：读出每个项目的自动清理设置，交给纯函数判断，
   * 并把“正在使用而顺延”记成 snoozedUntil。`inUse` 是现在有运行的项目 id（supervisor 提供）。
   * 找不到 playground.json 或它是更新版本写的项目，当作“已保留”跳过。
   */
  async checkAutoClean(inUse: ReadonlySet<string>): Promise<AutoCleanVerdict> {
    const { root, platform, now } = this.#deps;
    const rootPresent = await platform.fs.exists(root);
    const candidates: AutoCleanCandidate[] = [];
    if (rootPresent) {
      for (const { entry } of this.list()) {
        const read = await readPlaygroundFile(platform.fs, absPath(entry.path));
        if (read.status !== "ok") continue;
        candidates.push({
          id: entry.id,
          autoClean: read.value.autoClean,
          lastUsedAt: entry.lastUsedAt,
          remindedAt: entry.clean?.remindedAt,
          snoozedUntil: entry.clean?.snoozedUntil,
          missingSince: entry.missingSince,
        });
      }
    }
    const verdict = judgeAutoClean({ now: now(), rootPresent, candidates, inUse });
    if (verdict.postponed.length > 0 && !this.#index.isReadOnly()) {
      for (const { id, until } of verdict.postponed) {
        const entry = this.#index.byId(id);
        if (entry)
          this.#index.replace({ ...entry, clean: { ...entry.clean, snoozedUntil: until } });
      }
      await this.#index.save(root);
    }
    return verdict;
  }

  /**
   * 打开、关闭或改天数。从“已保留”打开时计时从现在起算（LIBRARY-AUTO-CLEAN-07）；
   * 关闭或改天数都清除提醒状态，到期时间变了，旧提醒不再作数（-05、-18）
   */
  async setAutoClean(ref: string, days: number | null): Promise<LibraryItem> {
    const item = this.requireFolder(ref);
    const file = await readPlaygroundFile(this.#deps.platform.fs, absPath(item.entry.path));
    const wasEnabled = file.status === "ok" && file.value.autoClean.enabled;
    await writeAutoClean(
      this.#operations(),
      item,
      days === null ? { enabled: false } : { enabled: true, days },
    );
    const { clean: _cleared, ...rest } = item.entry;
    const entry: LibraryEntry =
      days !== null && !wasEnabled ? { ...rest, lastUsedAt: this.#deps.now() } : rest;
    this.#index.replace(entry);
    await this.#index.save(this.#deps.root);
    return { name: item.name, entry };
  }

  /** 界面确认提醒真的显示了：记下时间，之后不再进入待提醒清单（clean.ackReminder） */
  async ackReminder(ref: string): Promise<void> {
    const item = this.#known(ref);
    this.#index.replace({
      ...item.entry,
      clean: { ...item.entry.clean, remindedAt: this.#deps.now() },
    });
    await this.#index.save(this.#deps.root);
  }

  /** 提醒里的“改为保留”（clean.keep） */
  async keep(ref: string): Promise<LibraryItem> {
    return this.setAutoClean(ref, null);
  }

  /**
   * 记一次使用（运行启动：命令行 run、new --run，或持有者为 tab 的 run.start）：
   * 计时重新开始并清除提醒与顺延。只读命令和“打开但不运行”不要调用它
   */
  async markUsed(ref: string): Promise<void> {
    const item = this.#known(ref);
    const { clean: _cleared, ...rest } = item.entry;
    this.#index.replace({ ...rest, lastUsedAt: this.#deps.now() });
    await this.#index.save(this.#deps.root);
  }

  /**
   * 记一次打开（应用里打开项目标签页，含“打开但不运行”）：只写 lastOpenedAt，
   * 不动 lastUsedAt、提醒与顺延，所以不重置自动清理的计时
   */
  async markOpened(ref: string): Promise<void> {
    const item = this.#known(ref);
    this.#index.replace({ ...item.entry, lastOpenedAt: this.#deps.now() });
    await this.#index.save(this.#deps.root);
  }

  /** 只动索引的操作（提醒、使用）：文件夹找不到也可以做 */
  #known(ref: string): LibraryItem {
    const item = this.find(ref);
    if (!item) throw libraryError("PLAYGROUND_NOT_FOUND", { name: ref }, `no playground ${ref}`);
    return item;
  }

  #operations(): OperationContext {
    const { root, platform, now } = this.#deps;
    return { root, platform, now, index: this.#index };
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
