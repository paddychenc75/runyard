import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import type { LibraryEntry } from "@runyard/protocol";
import type { CreateContext } from "./create-playground.ts";
import { libraryError } from "./library-error.ts";
import type { CreatePlaygroundResult, LibraryItem } from "./library-types.ts";
import {
  playgroundFilePath,
  readPlaygroundFile,
  serializePlaygroundFile,
} from "./playground-file-io.ts";
import { assertValidName, nextDefaultName } from "./playground-name.ts";

// 创建副本（规格 DESKTOP-LIBRARY-VIEW-42，PRD #prd-workspace-menu）：文件夹内容照抄，依赖目录
// 不抄（运行时重新安装），名称按“模板标识加序号”取，备注和保留状态沿用，新 id、新端口。
// 副本不会自动运行，原项目的运行也不受影响：这里只读原文件夹，不碰运行。

/** 不复制的目录名：依赖目录可以重新安装，复制既慢又占地方（负责人的回答） */
const SKIPPED_DIRS = new Set(["node_modules"]);

type CopyFs = Pick<
  Platform["fs"],
  "listDirs" | "listFiles" | "readBytes" | "makeDir" | "writeFile"
>;

async function copyTree(fs: CopyFs, from: AbsPath, to: AbsPath, top: boolean): Promise<void> {
  await fs.makeDir(to);
  for (const file of await fs.listFiles(from)) {
    const bytes = await fs.readBytes(absPath(join(from, file)));
    if (bytes !== null) await fs.writeFile(absPath(join(to, file)), bytes);
  }
  for (const dir of await fs.listDirs(from)) {
    // .runyard 里只有 playground.json 是项目自己的元数据，副本另写一份新的
    if (SKIPPED_DIRS.has(dir) || (top && dir === ".runyard")) continue;
    await copyTree(fs, absPath(join(from, dir)), absPath(join(to, dir)), false);
  }
}

export async function duplicatePlayground(
  ctx: CreateContext,
  item: LibraryItem,
  request: { name?: string },
): Promise<CreatePlaygroundResult> {
  ctx.index.assertWritable();
  const source = absPath(item.entry.path);
  const read = await readPlaygroundFile(ctx.platform.fs, source);
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
  const original = read.value;
  const name =
    request.name ??
    // 只看资源库根目录里现存的文件夹，同新建的默认名规则
    nextDefaultName(original.template.id, await ctx.platform.fs.listDirs(ctx.root));
  assertValidName(ctx.platform.paths.validateName, name);
  const dir = absPath(join(ctx.root, name));
  if (await ctx.platform.fs.exists(dir)) {
    throw libraryError("NAME_EXISTS", { name }, `folder already exists: ${name}`);
  }
  if (ctx.platform.paths.checkLength(dir) === "too-long") {
    throw libraryError("PATH_TOO_LONG", { name }, `path too long: ${dir.length} chars`);
  }
  const id = ctx.newId();
  const port = await ctx.ports.allocate({
    playgroundId: id,
    runner: original.runner,
    taken: ctx.index.takenPorts(),
  });
  const file = { ...original, id, createdAt: ctx.now(), createdBy: { kind: "user" } as const };
  try {
    await copyTree(ctx.platform.fs, source, dir, true);
    await ctx.platform.fs.makeDir(absPath(join(dir, ".runyard")));
    await ctx.platform.fs.writeAtomic(playgroundFilePath(dir), serializePlaygroundFile(file));
  } catch (error) {
    // 半成品只能进废纸篓
    await ctx.platform.fs.trash(dir).catch(() => undefined);
    throw error;
  }
  const entry: LibraryEntry = {
    id,
    path: dir,
    ...(port === null ? {} : { port }),
    lastUsedAt: file.createdAt,
  };
  ctx.index.add(entry);
  await ctx.index.save(ctx.root);
  return {
    created: true,
    name,
    path: dir,
    entry,
    file,
    retention: file.autoClean.enabled ? "auto-clean" : "kept",
    notices: [],
  };
}
