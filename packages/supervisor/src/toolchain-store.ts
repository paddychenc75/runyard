import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import {
  serializeVersioned,
  TOOLCHAIN_FILE_VERSION,
  type ToolchainFile,
  toolchainFileFormat,
} from "@runyard/protocol";
import { createAsyncMutex } from "./async-mutex.ts";
import { readStateFile, writeStateFile } from "./state-file.ts";

// ~/.runyard/state/toolchain.json：工具检测结果的缓存（决策记录 0009）。只是缓存：
// 坏了丢弃重来，更新版本写的不读也不写（照常检测，不报错，storage.md 第 3 节的例外）。
// 给 ToolchainService 的 initialCache 和 onCacheChange 用。

export function toolchainFilePath(platform: Pick<Platform, "paths">): AbsPath {
  return absPath(join(platform.paths.stateDir, "state", "toolchain.json"));
}

export interface ToolchainStore {
  /** 没有、坏了或是更新版本写的：undefined（调用方照常检测） */
  load(): Promise<ToolchainFile["entries"] | undefined>;
  save(entries: ToolchainFile["entries"]): Promise<void>;
}

export function createToolchainStore(deps: {
  platform: Pick<Platform, "paths" | "fs">;
  now: () => number;
}): ToolchainStore {
  const { platform, now } = deps;
  const path = toolchainFilePath(platform);
  const mutex = createAsyncMutex();
  return {
    async load() {
      const result = await readStateFile<ToolchainFile>(
        platform.fs,
        path,
        toolchainFileFormat,
        now(),
      );
      return result.status === "ok" ? result.value.entries : undefined;
    },
    save: (entries) =>
      mutex.run(async () => {
        const result = await readStateFile<ToolchainFile>(
          platform.fs,
          path,
          toolchainFileFormat,
          now(),
        );
        if (result.status === "newer") return;
        await writeStateFile(
          platform.fs,
          path,
          serializeVersioned(toolchainFileFormat, {
            formatVersion: TOOLCHAIN_FILE_VERSION,
            entries,
          }),
        );
      }),
  };
}
