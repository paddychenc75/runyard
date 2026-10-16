import { join } from "node:path";
import { type AbsPath, absPath, type Platform } from "@runyard/platform";
import {
  RUN_RECORD_VERSION,
  type RunRecord,
  runRecordFormat,
  serializeVersioned,
} from "@runyard/protocol";
import { readStateFile, writeStateFile } from "./state-file.ts";

// ~/.runyard/run/runs/<runId>.json：每次运行一个，只为管理进程崩溃之后的清理（storage.md 第 2.4 节）。
// 运行期间的真相在内存里，这里只在进程起来时写、运行结束时删。

export type RunRecordRead =
  | { readonly status: "ok"; readonly record: RunRecord }
  /** 更新版本写的：不读、不动，也就不能核对其中的进程 */
  | { readonly status: "newer"; readonly file: AbsPath }
  /** 坏文件已改名留存；身份只存在这个文件里，里面的进程不结束 */
  | { readonly status: "corrupt"; readonly file: AbsPath; readonly quarantinedAs: AbsPath };

export interface RunRecordStore {
  write(record: RunRecord): Promise<void>;
  remove(runId: string): Promise<void>;
  readAll(): Promise<RunRecordRead[]>;
}

export function runRecordsDir(platform: Pick<Platform, "paths">): AbsPath {
  return absPath(join(platform.paths.stateDir, "run", "runs"));
}

export function createRunRecordStore(deps: {
  platform: Pick<Platform, "paths" | "fs">;
  now: () => number;
}): RunRecordStore {
  const { platform, now } = deps;
  const dir = runRecordsDir(platform);
  const fileOf = (runId: string) => absPath(join(dir, `${runId}.json`));
  return {
    write: (record) =>
      writeStateFile(
        platform.fs,
        fileOf(record.runId),
        serializeVersioned(runRecordFormat, { ...record, formatVersion: RUN_RECORD_VERSION }),
      ),
    // delete-allow: 管理进程自己的运行记录（运行结束后不再需要），不是用户的内容
    remove: (runId) => platform.fs.removeFile(fileOf(runId)),
    async readAll() {
      const reads: RunRecordRead[] = [];
      for (const name of await platform.fs.listFiles(dir)) {
        if (!name.endsWith(".json")) continue;
        const file = absPath(join(dir, name));
        const result = await readStateFile<RunRecord>(platform.fs, file, runRecordFormat, now());
        if (result.status === "ok") reads.push({ status: "ok", record: result.value });
        else if (result.status === "newer") reads.push({ status: "newer", file });
        else if (result.status === "recovered") {
          reads.push({ status: "corrupt", file, quarantinedAs: result.quarantinedAs });
        }
      }
      return reads;
    },
  };
}
