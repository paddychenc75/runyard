import type { AbsPath } from "@runyard/platform";
import type { PlaygroundFile, RequestSpec } from "@runyard/protocol";
import { libraryError } from "./library-error.ts";
import type { OperationContext } from "./library-operations.ts";
import type { LibraryItem } from "./library-types.ts";
import {
  playgroundFilePath,
  readPlaygroundFile,
  serializePlaygroundFile,
} from "./playground-file-io.ts";

export interface PlaygroundEdits {
  readonly note?: string;
  readonly scriptAutoRun?: boolean;
  /** 请求面板上一次发出的请求（规格 DESKTOP-REQUEST-PANEL-08） */
  readonly lastRequest?: RequestSpec;
}

/**
 * 改备注、“脚本保存后自动运行”和请求面板的上一次请求：只写项目文件夹里的 playground.json，索引不动。
 * 更新版本写的文件只读不写；其余字段（含未知字段）原样带回去
 */
export async function updatePlaygroundFile(
  ctx: OperationContext,
  item: LibraryItem,
  edits: PlaygroundEdits,
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
  const next: PlaygroundFile = {
    ...read.value,
    ...(edits.note !== undefined ? { note: edits.note } : {}),
    ...(edits.scriptAutoRun !== undefined
      ? { script: { ...read.value.script, autoRun: edits.scriptAutoRun } }
      : {}),
    ...(edits.lastRequest !== undefined ? { lastRequest: edits.lastRequest } : {}),
  };
  await ctx.platform.fs.writeAtomic(playgroundFilePath(dir), serializePlaygroundFile(next));
}
