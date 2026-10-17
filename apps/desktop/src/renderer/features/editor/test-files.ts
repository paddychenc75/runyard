import type {
  EditorFileError,
  EditorFileResult,
  FileContent,
} from "../../../shared/editor-files.ts";
import type { OpenFilesMemory, RememberedFiles, SessionFiles } from "./editor-session.ts";

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
  };
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
      disk.files.set(path, { kind: "text", content });
      return { ok: true, value: { size: content.length } };
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
