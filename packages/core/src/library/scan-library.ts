import { basename, join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import type { LibraryEntry, PlaygroundFile } from "@runyard/protocol";
import type { LibraryIndex } from "./library-index.ts";
import type {
  LibraryStorage,
  PortSlotAllocator,
  ScanChange,
  ScanReport,
  ScanSkip,
} from "./library-types.ts";
import {
  playgroundFilePath,
  readPlaygroundFile,
  serializePlaygroundFile,
} from "./playground-file-io.ts";

// 启动时和资源库根目录变化时的扫描：判断“文件夹在应用外被动过”（规格 LIBRARY-PLAYGROUNDS-26 到 30，
// PRD #prd-decision-table 第 19 项）。判断表：
//   1. 同一个 id 出现在别的路径        -> 按 id 认回，更新路径，端口和设置不变
//   2. 索引里的 id 在磁盘上找不到      -> 标 missingSince（保留端口和设置，等“重新定位”）
//   3. 同一个 id 出现两份              -> 路径与索引一致的那份保留，其余换新 id 和新端口
//   4. 文件夹里没有 .runyard/playground.json -> 忽略
//   5. 磁盘上有、索引里没有的 id       -> 登记（重建索引，或用户放进来的），分配端口
// 磁盘上的项目文件夹里只有第 3 条的“多出来的那份”会被改写（只换 id）。

export type ScanContext = {
  readonly root: AbsPath;
  readonly index: LibraryIndex;
  readonly storage: LibraryStorage;
  readonly platform: Pick<Platform, "fs">;
  readonly ports: PortSlotAllocator;
  readonly now: () => number;
  readonly newId: () => string;
};

type Found = {
  readonly dir: AbsPath;
  readonly id: string;
  /** 更新版本写的 playground.json 不改写，所以没有 file */
  readonly file: PlaygroundFile | null;
};

async function discover(ctx: ScanContext): Promise<{ found: Found[]; skipped: ScanSkip[] }> {
  const found: Found[] = [];
  const skipped: ScanSkip[] = [];
  const names = [...(await ctx.storage.listDirs(ctx.root))].sort();
  for (const name of names) {
    const dir = absPath(join(ctx.root, name));
    const read = await readPlaygroundFile(ctx.storage, dir);
    if (read.status === "absent") continue;
    if (read.status === "ok") found.push({ dir, id: read.value.id, file: read.value });
    else if (read.status === "newer" && read.id !== null)
      found.push({ dir, id: read.id, file: null });
    else skipped.push({ path: dir, reason: read.status === "newer" ? "newer" : "corrupt" });
  }
  return { found, skipped };
}

function groupById(found: readonly Found[]): Map<string, Found[]> {
  const groups = new Map<string, Found[]>();
  for (const item of found) groups.set(item.id, [...(groups.get(item.id) ?? []), item]);
  return groups;
}

async function registerNew(
  ctx: ScanContext,
  item: Found & { file: PlaygroundFile },
  id: string,
): Promise<LibraryEntry> {
  const port = await ctx.ports.allocate({
    playgroundId: id,
    runner: item.file.runner,
    taken: ctx.index.takenPorts(),
  });
  const entry: LibraryEntry = {
    id,
    path: item.dir,
    ...(port === null ? {} : { port }),
    // 索引重建时 lastUsedAt 取当前时间：自动清理只会变晚，不会变早
    lastUsedAt: ctx.now(),
  };
  ctx.index.add(entry);
  return entry;
}

async function reassignCopy(
  ctx: ScanContext,
  item: Found,
  changes: ScanChange[],
  skipped: ScanSkip[],
): Promise<void> {
  if (item.file === null) {
    skipped.push({ path: item.dir, reason: "newer" });
    return;
  }
  const id = ctx.newId();
  // 先写文件夹里的新 id，再登记；中途失败时索引里没有这一份，下次扫描仍判为多出来的那份
  const file = { ...item.file, id };
  await ctx.platform.fs.writeAtomic(playgroundFilePath(item.dir), serializePlaygroundFile(file));
  await registerNew(ctx, { ...item, file }, id);
  changes.push({
    kind: "copied",
    oldId: item.id,
    id,
    name: basename(item.dir),
    path: item.dir,
  });
}

function recognise(ctx: ScanContext, entry: LibraryEntry, keeper: Found): ScanChange | null {
  const moved = entry.path !== keeper.dir;
  if (!moved && entry.missingSince === undefined) return null;
  const { missingSince: _gone, ...rest } = entry;
  ctx.index.replace({ ...rest, path: keeper.dir });
  return {
    kind: "changed",
    id: entry.id,
    name: basename(keeper.dir),
    path: keeper.dir,
    reason: moved ? "renamed-or-moved" : "recovered",
  };
}

async function reconcileGroup(
  ctx: ScanContext,
  id: string,
  group: readonly Found[],
  changes: ScanChange[],
  skipped: ScanSkip[],
): Promise<void> {
  const entry = ctx.index.byId(id);
  const keeper = (entry && group.find((item) => item.dir === entry.path)) ?? (group[0] as Found);
  if (entry) {
    const change = recognise(ctx, entry, keeper);
    if (change) changes.push(change);
  } else if (keeper.file === null) {
    skipped.push({ path: keeper.dir, reason: "newer" });
  } else {
    await registerNew(ctx, { ...keeper, file: keeper.file }, id);
    changes.push({ kind: "added", id, name: basename(keeper.dir), path: keeper.dir });
  }
  for (const item of group) if (item !== keeper) await reassignCopy(ctx, item, changes, skipped);
}

// 根目录之外的项目（用户“重新定位”过的）不会出现在根目录的列表里，要按它登记的路径去核对
async function markMissing(
  ctx: ScanContext,
  seen: ReadonlySet<string>,
  changes: ScanChange[],
): Promise<void> {
  for (const entry of [...ctx.index.entries()]) {
    if (seen.has(entry.id)) continue;
    const read = await readPlaygroundFile(ctx.storage, entry.path as AbsPath);
    const stillThere =
      (read.status === "ok" && read.value.id === entry.id) ||
      (read.status === "newer" && read.id === entry.id);
    if (stillThere) {
      if (entry.missingSince === undefined) continue;
      const { missingSince: _gone, ...rest } = entry;
      ctx.index.replace(rest);
      changes.push({
        kind: "changed",
        id: entry.id,
        name: basename(entry.path),
        path: entry.path as AbsPath,
        reason: "recovered",
      });
    } else if (entry.missingSince === undefined) {
      ctx.index.replace({ ...entry, missingSince: ctx.now() });
      changes.push({
        kind: "missing",
        id: entry.id,
        name: basename(entry.path),
        path: entry.path as AbsPath,
      });
    }
  }
}

/** 扫描资源库根目录并更新索引；调用方负责落盘（index.save）和发事件 */
export async function scanLibrary(ctx: ScanContext): Promise<ScanReport> {
  ctx.index.assertWritable();
  const { found, skipped } = await discover(ctx);
  const changes: ScanChange[] = [];
  const groups = groupById(found);
  for (const [id, group] of groups) await reconcileGroup(ctx, id, group, changes, skipped);
  await markMissing(ctx, new Set(groups.keys()), changes);
  return { changes, skipped };
}
