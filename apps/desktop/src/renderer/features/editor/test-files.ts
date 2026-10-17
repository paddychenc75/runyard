import type {
  EditorFileError,
  EditorFileResult,
  FileChange,
  FileContent,
} from "../../../shared/editor-files.ts";
import type { OpenFilesMemory, RememberedFiles, SessionFiles } from "./session-types.ts";

// 编辑会话和编辑器列的测试替身（只在 *.test.* 里导入）：内存里的文件、记着写入的文件接口、内存里的“上次打开的文件”

export type FakeFile =
  | { kind: "text"; content: string; eol?: "lf" | "crlf" | "mixed" | "none"; size?: number }
  | { kind: "binary"; size: number }
  | { kind: "too-large"; size: number };

export interface FakeDisk {
  files: Map<string, FakeFile>;
  writes: { path: string; content: string; eol: "lf" | "crlf" | undefined }[];
  /** 下一次写入要失败的原因（失败一次后恢复） */
  failNextWrite: "read-only" | "permission" | "other" | null;
  /** 读过哪些文件（按顺序），测“没有多余的重读” */
  reads: string[];
  /** 监听着磁盘变化的会话 */
  watchers: Set<(changes: FileChange[]) => void>;
}

export function fakeDisk(files: Record<string, string | FakeFile> = {}): FakeDisk {
  return {
    files: new Map(
      Object.entries(files).map(([path, file]) => [
        path,
        typeof file === "string" ? { kind: "text", content: file } : file,
      ]),
    ),
    writes: [],
    failNextWrite: null,
    reads: [],
    watchers: new Set(),
  };
}

/** 磁盘上的变化通知（和主进程的 files.changed 一样成批） */
export function emitChanges(disk: FakeDisk, changes: FileChange[]): void {
  for (const watcher of [...disk.watchers]) watcher(changes);
}

/** 别的程序改写了文件：先改磁盘再通知 */
export function externalWrite(disk: FakeDisk, path: string, content: string): void {
  const existed = disk.files.has(path);
  disk.files.set(path, { kind: "text", content });
  emitChanges(disk, [{ kind: existed ? "change" : "add", path, self: false }]);
}

/** 别的程序删了文件 */
export function externalRemove(disk: FakeDisk, path: string): void {
  disk.files.delete(path);
  emitChanges(disk, [{ kind: "remove", path, self: false }]);
}

function eolOf(content: string): "lf" | "crlf" | "mixed" | "none" {
  const crlf = (content.match(/\r\n/g) ?? []).length;
  const lf = (content.match(/\n/g) ?? []).length - crlf;
  if (crlf > 0 && lf > 0) return "mixed";
  if (crlf > 0) return "crlf";
  return lf > 0 ? "lf" : "none";
}

const error = (code: "EDITOR_NOT_FOUND" | "EDITOR_SAVE_FAILED", path: string, reason?: string) =>
  ({
    code,
    params: code === "EDITOR_SAVE_FAILED" ? { path, reason } : { path },
  }) as EditorFileError;

export function filesOn(disk: FakeDisk): SessionFiles {
  return {
    async read(path): Promise<EditorFileResult<FileContent>> {
      disk.reads.push(path);
      const file = disk.files.get(path);
      if (file === undefined) return { ok: false, error: error("EDITOR_NOT_FOUND", path) };
      if (file.kind !== "text") return { ok: true, value: file };
      return {
        ok: true,
        value: {
          kind: "text",
          content: file.content,
          eol: file.eol ?? eolOf(file.content),
          size: file.size ?? file.content.length,
          large: false,
        },
      };
    },
    async write(path, content, eol) {
      if (disk.failNextWrite !== null) {
        const reason = disk.failNextWrite;
        disk.failNextWrite = null;
        return { ok: false, error: error("EDITOR_SAVE_FAILED", path, reason) };
      }
      disk.writes.push({ path, content, eol });
      const existed = disk.files.has(path);
      disk.files.set(path, { kind: "text", content });
      // 主进程的文件服务保存后会推一条自己引起的变化（self）
      emitChanges(disk, [{ kind: existed ? "change" : "add", path, self: true }]);
      return { ok: true, value: { size: content.length } };
    },
    watch(listener) {
      disk.watchers.add(listener);
      return () => disk.watchers.delete(listener);
    },
  };
}

export function fakeMemory(initial: RememberedFiles | null = null): OpenFilesMemory & {
  saved: RememberedFiles | null;
} {
  const memory = {
    saved: initial,
    load: () => memory.saved,
    save: (state: RememberedFiles) => {
      memory.saved = state;
    },
  };
  return memory;
}
