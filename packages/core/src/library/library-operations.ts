import { basename, dirname, join } from "node:path";
import { type AbsPath, absPath, type Platform, type TrashResult } from "@runyard/platform";
import type { LibraryEntry, PlaygroundFile } from "@runyard/protocol";
import { isLibraryError, libraryError } from "./library-error.ts";
import type { LibraryIndex } from "./library-index.ts";
import type { LibraryItem } from "./library-types.ts";
import {
  playgroundFilePath,
  readPlaygroundFile,
  serializePlaygroundFile,
} from "./playground-file-io.ts";
import { assertValidName } from "./playground-name.ts";

// 改名与移到废纸篓中属于 core 的部分（技术设计 §4.3 的固定顺序第 5 步）。
// 第 1 到 4 步（停止、请所有客户端释放句柄、等回报、确认进程树退出）和第 6 步（改名前在
// 运行的项目用新名称重新启动，持有者不变）由 supervisor 编排，经 `beforeMove` 接进来。

export type OperationContext = {
  readonly root: AbsPath;
  readonly platform: Pick<Platform, "paths" | "fs">;
  readonly index: LibraryIndex;
  readonly now: () => number;
};

export interface RenameHooks {
  /** 项目正在 installing 或 starting；是则报 BUSY，什么也不改（在名称校验之后检查） */
  readonly isBusy: () => boolean | Promise<boolean>;
  /** 所有检查通过之后、动文件夹之前：停止运行，让所有客户端释放句柄 */
  readonly beforeMove: () => Promise<void>;
}

export interface TrashHooks {
  readonly beforeMove: () => Promise<void>;
  /** 第一版在 macOS 上整个文件夹进废纸篓，平台层不使用这个参数；接口里留着（Windows 见 #58） */
  readonly regenerable?: Parameters<Platform["fs"]["trash"]>[1];
}

export interface RenameResult {
  readonly before: LibraryItem;
  readonly after: LibraryItem;
}

export interface TrashOutcome {
  readonly removed: LibraryItem;
  readonly restorable: boolean;
  readonly result: TrashResult;
}

// 平台层的错误（PlatformError）和资源库的错误形状相同：按 `error.code` 原样带出，
// 不在这里换成别的码，也不退到别的做法
function rethrowAsLibrary(cause: unknown): never {
  if (isLibraryError(cause)) throw cause;
  const error = (cause as { error?: { code?: unknown } } | null)?.error;
  if (error && typeof error.code === "string") {
    const e = error as { code: Parameters<typeof libraryError>[0]; params: never; debug: string };
    throw libraryError(e.code, e.params, e.debug);
  }
  throw cause;
}

export async function renamePlayground(
  ctx: OperationContext,
  item: LibraryItem,
  newName: string,
  hooks: RenameHooks,
): Promise<RenameResult> {
  ctx.index.assertWritable();
  // 先校验名称：保留名等在这里就被拒，运行不受影响（规格 LIBRARY-PLAYGROUNDS-13）
  assertValidName(ctx.platform.paths.validateName, newName);
  if (await hooks.isBusy()) {
    throw libraryError("BUSY", { name: item.name }, "playground is installing or starting");
  }
  const from = item.entry.path as AbsPath;
  const to = absPath(join(dirname(from), newName));
  if (newName !== item.name && (await ctx.platform.fs.exists(to))) {
    throw libraryError("NAME_EXISTS", { name: newName }, `target exists: ${newName}`);
  }
  await hooks.beforeMove();
  if (newName !== item.name) {
    // 平台层不覆盖已有的同名文件夹，被占用时报 PATH_LOCKED 且原文件夹不动
    try {
      await ctx.platform.fs.moveDir(from, to);
    } catch (cause) {
      rethrowAsLibrary(cause);
    }
  }
  // 端口和其他设置不动，只换路径
  const entry: LibraryEntry = { ...item.entry, path: to };
  ctx.index.replace(entry);
  await ctx.index.save(ctx.root);
  return { before: item, after: { name: basename(to), entry } };
}

export async function trashPlayground(
  ctx: OperationContext,
  item: LibraryItem,
  hooks: TrashHooks,
): Promise<TrashOutcome> {
  ctx.index.assertWritable();
  await hooks.beforeMove();
  // 只经平台层 fs.trash；失败（TRASH_UNAVAILABLE、PATH_LOCKED）时文件夹和索引都原样保留，
  // 不退到别的删除方式，下一轮再试
  let result: TrashResult;
  try {
    result = await ctx.platform.fs.trash(item.entry.path as AbsPath, hooks.regenerable);
  } catch (cause) {
    rethrowAsLibrary(cause);
  }
  ctx.index.remove(item.entry.id);
  await ctx.index.save(ctx.root);
  return { removed: item, restorable: result.restorable, result };
}

/** 读 playground.json 并改写自动清理；更新版本写的文件只读不写 */
export async function writeAutoClean(
  ctx: OperationContext,
  item: LibraryItem,
  autoClean: PlaygroundFile["autoClean"],
): Promise<void> {
  const dir = item.entry.path as AbsPath;
  const read = await readPlaygroundFile(ctx.platform.fs, dir);
  if (read.status === "newer") {
    throw libraryError(
      "DATA_FROM_NEWER_VERSION",
      { file: "playground.json", found: read.found, supported: read.supported },
      "playground.json was written by a newer version",
    );
  }
  if (read.status !== "ok") {
    throw libraryError("INTERNAL", {}, `playground.json is ${read.status}`);
  }
  await ctx.platform.fs.writeAtomic(
    playgroundFilePath(dir),
    serializePlaygroundFile({ ...read.value, autoClean }),
  );
}
