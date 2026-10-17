import { vi } from "vitest";
import type { DesktopBridge, DesktopEvents } from "../../../shared/desktop-bridge.ts";
import type {
  EditorFileError,
  EditorFileResult,
  FileChange,
  FileEntry,
  NameProblem,
} from "../../../shared/editor-files.ts";
import { baseNameOf, joinPath, parentOf } from "./file-tree-model.ts";

// 文件树界面测试用的假桥：内存里的文件系统（路径到内容，文件夹是 null），按文件服务的接口回答。
// 名字校验照文件服务的规则抄一份最小版（空、斜杠、点），真实规则在 main/editor-files/entry-name.ts 的测试里。
// 只在 *.test.tsx 里导入。

export type FakeFs = Map<string, string | null>;

const fail = <T>(error: EditorFileError): EditorFileResult<T> => ({ ok: false, error });

function nameProblem(name: string): NameProblem | null {
  if (name.trim() === "") return "empty";
  if (name.includes("/")) return "separator";
  if (name === "." || name === "..") return "dot";
  return null;
}

export interface FakeFiles {
  bridge: DesktopBridge;
  fs: FakeFs;
  call: ReturnType<typeof vi.fn>;
  /** 进了废纸篓的路径和当时带的未保存内容 */
  trashed: { path: string; unsaved: string | undefined }[];
  /** 让这些路径放不进废纸篓 */
  locked: Set<string>;
  /** 模拟磁盘上的外部修改：先改 fs，再推 files.changed */
  external: (mutate: (fs: FakeFs) => void, changes: FileChange[]) => void;
  listCalls: () => string[];
}

export function fakeFiles(initial: Record<string, string | null>, project = "demo"): FakeFiles {
  const fs: FakeFs = new Map(Object.entries(initial));
  const listeners = new Set<(payload: DesktopEvents["files.changed"]) => void>();
  const trashed: FakeFiles["trashed"] = [];
  const locked = new Set<string>();

  const children = (folder: string): FileEntry[] => {
    const out: FileEntry[] = [];
    for (const [path, content] of fs) {
      if (parentOf(path) !== folder || path === "") continue;
      out.push({
        name: baseNameOf(path),
        path,
        kind: content === null ? "folder" : "file",
        symlink: false,
      });
    }
    return out.sort(
      (a, b) =>
        Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name),
    );
  };

  const handlers: Record<string, (param: never) => unknown> = {
    "files.list": ({ path }: { path: string }) =>
      path !== "" && fs.get(path) !== null
        ? fail({ code: "EDITOR_NOT_FOUND", params: { path } })
        : { ok: true, value: children(path) },
    "files.create": ({
      path,
      kind,
      name,
    }: {
      path: string;
      kind: "file" | "folder";
      name: string;
    }) => {
      const problem = nameProblem(name);
      if (problem !== null)
        return fail({ code: "EDITOR_NAME_INVALID", params: { name, reason: problem } });
      const target = joinPath(path, name);
      if (fs.has(target)) return fail({ code: "EDITOR_NAME_EXISTS", params: { name } });
      fs.set(target, kind === "folder" ? null : "");
      return { ok: true, value: { path: target } };
    },
    "files.rename": ({ path, name }: { path: string; name: string }) => {
      const problem = nameProblem(name);
      if (problem !== null)
        return fail({ code: "EDITOR_NAME_INVALID", params: { name, reason: problem } });
      const target = joinPath(parentOf(path), name);
      if (fs.has(target)) return fail({ code: "EDITOR_NAME_EXISTS", params: { name } });
      for (const [key, content] of [...fs]) {
        if (key === path || key.startsWith(`${path}/`)) {
          fs.delete(key);
          fs.set(`${target}${key.slice(path.length)}`, content);
        }
      }
      return { ok: true, value: { path: target } };
    },
    "files.trash": ({ path, unsaved }: { path: string; unsaved?: string }) => {
      if (locked.has(path)) return fail({ code: "EDITOR_TRASH_FAILED", params: { path } });
      trashed.push({ path, unsaved });
      for (const key of [...fs.keys()])
        if (key === path || key.startsWith(`${path}/`)) fs.delete(key);
      return { ok: true, value: { restorable: true } };
    },
    "files.watch": () => ({ ok: true, value: null }),
    "files.unwatch": () => undefined,
  };

  const call = vi.fn(async (method: string, param?: unknown) => {
    const handler = handlers[method];
    return handler === undefined ? undefined : handler(param as never);
  });
  const bridge = {
    bootstrap: { platform: "darwin", modKey: "meta", locale: "zh-CN" },
    call,
    on: (event: string, listener: (payload: DesktopEvents["files.changed"]) => void) => {
      if (event === "files.changed") listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as DesktopBridge;

  return {
    bridge,
    fs,
    call,
    trashed,
    locked,
    external: (mutate, changes) => {
      mutate(fs);
      for (const listener of listeners) listener({ project, changes });
    },
    listCalls: () =>
      call.mock.calls
        .filter(([m]) => m === "files.list")
        .map(([, p]) => (p as { path: string }).path),
  };
}
