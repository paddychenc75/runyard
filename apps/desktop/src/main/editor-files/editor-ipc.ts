import type { EditorFileMethod, EditorFileResult, FileTarget } from "../../shared/editor-files.ts";
import type { EditorFileService } from "./file-service.ts";

// 把界面发来的文件消息接到服务上。页面发来的数据不可信：形状不对一律不调用服务，
// 返回“找不到”类的失败结果，界面不会收到异常。

type Params = Record<string, unknown>;

function asParams(value: unknown): Params | null {
  return typeof value === "object" && value !== null ? (value as Params) : null;
}

function target(value: unknown): FileTarget | null {
  const p = asParams(value);
  if (p === null || typeof p.project !== "string" || typeof p.path !== "string") return null;
  return { project: p.project, path: p.path };
}

const malformed = (path = ""): EditorFileResult<never> => ({
  ok: false,
  error: { code: "EDITOR_IO_FAILED", params: { path } },
});

export function editorFileMethods(
  maybeService: EditorFileService | undefined,
): Record<EditorFileMethod, (param: unknown) => unknown> {
  // 没接线（测试里的最小装配）时调用才失败，注册本身不失败
  const need = (): EditorFileService => {
    if (maybeService === undefined) throw new Error("file service unavailable");
    return maybeService;
  };
  return {
    "files.list": (param) => {
      const t = target(param);
      return t === null ? malformed() : need().list(t.project, t.path);
    },
    "files.read": (param) => {
      const t = target(param);
      return t === null ? malformed() : need().read(t.project, t.path);
    },
    "files.write": (param) => {
      const t = target(param);
      const p = asParams(param);
      if (t === null || p === null || typeof p.content !== "string") return malformed();
      const eol = p.eol === "lf" || p.eol === "crlf" ? p.eol : undefined;
      return need().write(t.project, t.path, p.content, eol);
    },
    "files.create": (param) => {
      const t = target(param);
      const p = asParams(param);
      if (t === null || p === null || typeof p.name !== "string") return malformed();
      if (p.kind !== "file" && p.kind !== "folder") return malformed();
      return need().create(t.project, t.path, p.kind, p.name);
    },
    "files.rename": (param) => {
      const t = target(param);
      const p = asParams(param);
      if (t === null || p === null || typeof p.name !== "string") return malformed();
      return need().rename(t.project, t.path, p.name);
    },
    "files.trash": (param) => {
      const t = target(param);
      const p = asParams(param);
      if (t === null || p === null) return malformed();
      const unsaved = typeof p.unsaved === "string" ? p.unsaved : undefined;
      return need().trash(t.project, t.path, unsaved);
    },
    "files.watch": (param) => {
      const p = asParams(param);
      return p === null || typeof p.project !== "string" ? malformed() : need().watch(p.project);
    },
    "files.unwatch": async (param) => {
      const p = asParams(param);
      if (p !== null && typeof p.project === "string") await need().unwatch(p.project);
    },
  };
}
