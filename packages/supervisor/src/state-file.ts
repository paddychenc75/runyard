import { basename, dirname, join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import {
  type DataFileKind,
  type FileFormat,
  quarantineFileName,
  type ReadResult,
  readVersionedText,
} from "@runyard/protocol";
import { methodFailure } from "./method-failure.ts";

// 管理进程读写的共享状态文件（settings.json、toolchain.json）共用的读法：
// 存在且认得就升到最新版（只在内存里）；更新版本写的只读不写；坏了改名留存再按种类处理。
// 写入一律经 platform.fs.writeAtomic（先写临时文件再改名）。

export type StateFileRead<T> =
  | { readonly status: "absent" }
  | { readonly status: "ok"; readonly value: T; readonly upgraded: boolean }
  | {
      readonly status: "newer";
      readonly found: number;
      readonly supported: number;
      readonly raw: Record<string, unknown>;
    }
  /** 坏文件已改名留存 */
  | { readonly status: "recovered"; readonly quarantinedAs: AbsPath; readonly details: string[] };

type FsOf = Pick<Platform["fs"], "readText" | "renameFile" | "writeAtomic" | "makeDir">;

// T 是格式 schema 的输出类型；schema 已校验过，这里只是把类型带出来（本包不依赖 zod）
export async function readStateFile<T>(
  fs: FsOf,
  path: AbsPath,
  format: FileFormat,
  now: number,
): Promise<StateFileRead<T>> {
  const text = await fs.readText(path);
  if (text === null) return { status: "absent" };
  const result = readVersionedText(format, text) as ReadResult<T>;
  if (result.status === "ok") {
    return { status: "ok", value: result.value, upgraded: result.upgradedFrom !== undefined };
  }
  if (result.status === "newer") {
    return {
      status: "newer",
      found: result.fileVersion,
      supported: result.supportedVersion,
      raw: result.raw,
    };
  }
  // 留存而不删：方便排查，也不违反“不永久删除”
  const quarantinedAs = absPath(join(dirname(path), quarantineFileName(basename(path), now)));
  await fs.renameFile(path, quarantinedAs);
  return { status: "recovered", quarantinedAs, details: result.details };
}

export async function writeStateFile(fs: FsOf, path: AbsPath, text: string): Promise<void> {
  await fs.makeDir(absPath(dirname(path)));
  await fs.writeAtomic(path, text);
}

/** 写之前遇到更新版本写的文件时抛的错 */
export function newerVersionFailure(
  file: DataFileKind,
  read: { found: number; supported: number },
) {
  return methodFailure(
    "DATA_FROM_NEWER_VERSION",
    { file, found: read.found, supported: read.supported },
    `${file} was written by a newer version`,
  );
}
