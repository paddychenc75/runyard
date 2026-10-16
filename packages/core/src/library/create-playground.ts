import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import type { LibraryEntry, Notice, PlaygroundFile } from "@runyard/protocol";
import { libraryError } from "./library-error.ts";
import type { LibraryIndex } from "./library-index.ts";
import type {
  CreatePlaygroundRequest,
  CreatePlaygroundResult,
  PlaygroundSeed,
  PortSlotAllocator,
} from "./library-types.ts";
import {
  playgroundFilePath,
  readPlaygroundFile,
  serializePlaygroundFile,
} from "./playground-file-io.ts";
import { assertValidName, nextDefaultName } from "./playground-name.ts";

// 从模板文件集创建项目（规格 LIBRARY-PLAYGROUNDS-01 到 12，PRD #prd-create、#prd-naming）。
// 顺序是规格要求的：先校验名称（不碰任何东西），再检查重名和路径长度，最后才写文件。
// 写入顺序：先复制模板文件，最后写 .runyard/playground.json。没有这个文件的文件夹会被扫描忽略，
// 所以中途失败留下的半成品不会被当成项目。

export type CreateContext = {
  readonly root: AbsPath;
  readonly index: LibraryIndex;
  readonly platform: Pick<Platform, "paths" | "fs">;
  readonly ports: PortSlotAllocator;
  readonly now: () => number;
  readonly newId: () => string;
};

async function chooseName(
  ctx: CreateContext,
  seed: PlaygroundSeed,
  request: CreatePlaygroundRequest,
): Promise<string> {
  const name =
    request.name ??
    // 只看资源库根目录里现存的文件夹：序号不记已删除的，也不被根目录之外的项目占用
    nextDefaultName(seed.template.id, await ctx.platform.fs.listDirs(ctx.root));
  assertValidName(ctx.platform.paths.validateName, name);
  return name;
}

function lengthNotices(ctx: CreateContext, dir: AbsPath, name: string): Notice[] {
  const verdict = ctx.platform.paths.checkLength(dir);
  if (verdict === "too-long")
    throw libraryError("PATH_TOO_LONG", { name }, `path too long: ${dir.length} chars`);
  if (verdict === "ok") return [];
  return [
    {
      code: "PATH_NEAR_LIMIT",
      params: { length: [...dir].length, limit: ctx.platform.paths.maxPathLength },
    },
  ];
}

async function reuseExisting(
  ctx: CreateContext,
  name: string,
  dir: AbsPath,
): Promise<CreatePlaygroundResult> {
  const entry = ctx.index.byPath(dir);
  const read = entry ? await readPlaygroundFile(ctx.platform.fs, dir) : null;
  if (!entry || read?.status !== "ok")
    throw libraryError("NAME_EXISTS", { name }, `folder exists but is not a registered playground`);
  return resultOf(name, dir, entry, read.value, false, []);
}

function resultOf(
  name: string,
  path: AbsPath,
  entry: LibraryEntry,
  file: PlaygroundFile,
  created: boolean,
  notices: Notice[],
): CreatePlaygroundResult {
  return {
    created,
    name,
    path,
    entry,
    file,
    retention: file.autoClean.enabled ? "auto-clean" : "kept",
    notices,
  };
}

async function copySeedFiles(ctx: CreateContext, dir: AbsPath, seed: PlaygroundSeed) {
  await ctx.platform.fs.makeDir(dir);
  for await (const file of seed.files) {
    if (file.path === ".runyard" || file.path.startsWith(".runyard/"))
      throw libraryError("INTERNAL", {}, `seed file inside .runyard: ${file.path}`);
    const target = absPath(join(dir, ...file.path.split("/")));
    await ctx.platform.fs.makeDir(absPath(join(target, "..")));
    await ctx.platform.fs.writeFile(target, file.contents);
  }
}

function buildFile(
  seed: PlaygroundSeed,
  request: CreatePlaygroundRequest,
  id: string,
  createdAt: number,
): PlaygroundFile {
  return {
    formatVersion: 1,
    id,
    template: seed.template,
    runner: seed.runner,
    requires: { ...seed.requires },
    ...(seed.requiresInstall === undefined ? {} : { requiresInstall: seed.requiresInstall }),
    toolchainAtCreate: { ...seed.toolchainAtCreate },
    ...(seed.packageManager === undefined ? {} : { packageManager: seed.packageManager }),
    ...(seed.entry === undefined ? {} : { entry: seed.entry }),
    ...(seed.open === undefined ? {} : { open: seed.open }),
    ...(request.note === undefined ? {} : { note: request.note }),
    createdAt,
    createdBy: request.createdBy,
    // 创建后默认是“已保留”：自动清理要显式打开
    autoClean:
      request.autoCleanDays === undefined
        ? { enabled: false }
        : { enabled: true, days: request.autoCleanDays },
    ...(seed.scriptAutoRun === undefined ? {} : { script: { autoRun: seed.scriptAutoRun } }),
    trust: "trusted",
  };
}

export async function createPlayground(
  ctx: CreateContext,
  seed: PlaygroundSeed,
  request: CreatePlaygroundRequest,
): Promise<CreatePlaygroundResult> {
  // 1. 先校验名称：非法的名字什么都不碰（含不读磁盘上的索引状态以外的任何东西）
  const name = await chooseName(ctx, seed, request);
  ctx.index.assertWritable();
  const dir = absPath(join(ctx.root, name));

  // 2. 重名：同名文件夹已经存在（不论是不是项目）
  if (await ctx.platform.fs.exists(dir)) {
    if (request.ifExists === "reuse") return reuseExisting(ctx, name, dir);
    throw libraryError("NAME_EXISTS", { name }, `folder already exists: ${name}`);
  }
  const notices = lengthNotices(ctx, dir, name);

  // 3. 复制文件、分配端口，最后写元数据和索引
  const id = ctx.newId();
  const port = await ctx.ports.allocate({
    playgroundId: id,
    runner: seed.runner,
    taken: ctx.index.takenPorts(),
  });
  const file = buildFile(seed, request, id, ctx.now());
  try {
    await copySeedFiles(ctx, dir, seed);
    await ctx.platform.fs.makeDir(absPath(join(dir, ".runyard")));
    await ctx.platform.fs.writeAtomic(playgroundFilePath(dir), serializePlaygroundFile(file));
  } catch (error) {
    // 半成品只能进废纸篓（不做永久删除）；放不进就留着，下次重名时会明确报 NAME_EXISTS
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
  return resultOf(name, dir, entry, file, true, notices);
}
