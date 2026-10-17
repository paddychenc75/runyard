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
  /** 请求面板“服务重载后自动重发”的开合（规格 DESKTOP-REQUEST-PANEL-15） */
  readonly requestAutoResend?: boolean;
}

// 同一个 playground.json 的读改写排成一队：发请求写“上一次请求”和编辑备注、切开关可能同时发生，
// 各自读到旧内容再各自写回，后写的会盖掉先写的另一个字段（规格 DESKTOP-REQUEST-PANEL-17）。
// 只在本进程内排队：管理进程是单实例，也是唯一写这个文件的进程
const queues = new Map<string, Promise<unknown>>();

function inQueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const result = (queues.get(key) ?? Promise.resolve()).then(task, task);
  const tail = result.catch(() => undefined);
  queues.set(key, tail);
  // 队尾没人接着排时清掉，登记表不随项目数增长
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return result;
}

/**
 * 改备注、“脚本保存后自动运行”、请求面板的上一次请求和自动重发开关：只写项目文件夹里的 playground.json，索引不动。
 * 更新版本写的文件只读不写；其余字段（含未知字段）原样带回去
 */
export function updatePlaygroundFile(
  ctx: OperationContext,
  item: LibraryItem,
  edits: PlaygroundEdits,
): Promise<void> {
  return inQueue(item.entry.path, () => writeEdits(ctx, item, edits));
}

async function writeEdits(
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
    ...(edits.requestAutoResend !== undefined
      ? { requestAutoResend: edits.requestAutoResend }
      : {}),
  };
  await ctx.platform.fs.writeAtomic(playgroundFilePath(dir), serializePlaygroundFile(next));
}
