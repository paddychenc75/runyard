import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { EditorFileError, FileEntry } from "../../../shared/editor-files.ts";
import { watchProject } from "../../shared/project-watch.ts";
import {
  baseNameOf,
  type EditDraft,
  foldersToReload,
  isInside,
  parentOf,
  remapPrefix,
  type TreePath,
} from "./file-tree-model.ts";

/**
 * 文件树和工作区状态之间的接缝：编辑器与文件标签（#259）实现它。
 * 树只管列文件和改磁盘，打开哪个文件、哪些标签受影响、哪些文件有没保存的修改，都由这一侧回答。
 */
export interface FileTreeHost {
  /** 编辑器当前打开的文件（相对路径），树里高亮它 */
  activePath: TreePath | null;
  openFile: (relativePath: TreePath) => void;
  /** 这个文件有没保存的修改就返回它的全部内容，移到废纸篓时先把它写进去（DESKTOP-EDITOR-12） */
  unsavedContent?: (relativePath: TreePath) => string | undefined;
  /** 文件或文件夹改名了：打开着的文件标签跟着改路径（DESKTOP-EDITOR-09、10） */
  onRenamed?: (from: TreePath, to: TreePath) => void;
  /** 文件或文件夹移进废纸篓了：它们的文件标签关闭（DESKTOP-EDITOR-11） */
  onTrashed?: (path: TreePath) => void;
}

export type TreeNotice = { type: "trashed" } | { type: "error"; error: EditorFileError };

/** 磁盘变化之后等多久再重读：合并同一批里的多个事件，仍远小于规格的 2 秒 */
const RELOAD_DELAY_MS = 60;
const NOTICE_MS = 5000;

export interface FileTreeController {
  dirs: ReadonlyMap<TreePath, readonly FileEntry[]>;
  expanded: ReadonlySet<TreePath>;
  selected: TreePath | null;
  focused: TreePath | null;
  draft: EditDraft | null;
  /** 输入框旁要显示的失败（重名、名字不合法）；没有就是 null */
  draftError: EditorFileError | null;
  notice: TreeNotice | null;
  rootLoaded: boolean;
  setFocused: (path: TreePath | null) => void;
  select: (path: TreePath | null) => void;
  toggle: (path: TreePath, open?: boolean) => void;
  startCreate: (kind: "file" | "folder", parent: TreePath) => void;
  startRename: (path: TreePath) => void;
  cancelDraft: () => void;
  commitDraft: (name: string) => Promise<void>;
  trash: (path: TreePath) => Promise<void>;
  entryAt: (path: TreePath) => FileEntry | null;
}

export function useFileTree(
  bridge: DesktopBridge,
  project: string,
  host: FileTreeHost,
): FileTreeController {
  const [dirs, setDirs] = useState<ReadonlyMap<TreePath, readonly FileEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<TreePath>>(new Set());
  const [selected, setSelected] = useState<TreePath | null>(null);
  const [focused, setFocused] = useState<TreePath | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [draftError, setDraftError] = useState<EditorFileError | null>(null);
  const [notice, setNotice] = useState<TreeNotice | null>(null);
  // 异步回调里要读最新的状态；每次渲染后同步
  const latest = useRef({ dirs, expanded, draft, host });
  latest.current = { dirs, expanded, draft, host };
  const alive = useRef(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const showNotice = useCallback((next: TreeNotice) => {
    setNotice(next);
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const load = useCallback(
    async (folder: TreePath) => {
      const result = await bridge.call("files.list", { project, path: folder });
      // 没有文件服务的桥（别的界面测试里的最小假桥）什么都不回：当作没读到，不当异常
      if (!alive.current || !result) return;
      if (result.ok) {
        setDirs((prev) => new Map(prev).set(folder, result.value));
        return;
      }
      // 文件夹已经不在了（被外部删掉或改名）：丢掉它的缓存和展开状态；其他失败交给提示
      if (result.error.code === "EDITOR_NOT_FOUND" && folder !== "") {
        const gone = (path: TreePath) => isInside(path, folder);
        setDirs((prev) => new Map([...prev].filter(([path]) => !gone(path))));
        setExpanded((prev) => new Set([...prev].filter((path) => !gone(path))));
      } else {
        showNotice({ type: "error", error: result.error });
      }
    },
    [bridge, project, showNotice],
  );

  useEffect(() => {
    alive.current = true;
    const pending = new Set<TreePath>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const folders = [...pending];
      pending.clear();
      for (const folder of folders) void load(folder);
    };
    const stop = watchProject(bridge, project, (payload) => {
      const loaded = new Set(latest.current.dirs.keys());
      for (const folder of foldersToReload(payload.changes, loaded)) pending.add(folder);
      if (pending.size > 0 && timer === null) timer = setTimeout(flush, RELOAD_DELAY_MS);
    });
    // 先订阅再开监听再读：读之后发生的变化不会漏
    void load("");
    return () => {
      alive.current = false;
      stop();
      if (timer !== null) clearTimeout(timer);
      if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    };
  }, [bridge, project, load]);

  const toggle = useCallback(
    (path: TreePath, open?: boolean) => {
      const willOpen = open ?? !latest.current.expanded.has(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (willOpen) next.add(path);
        else next.delete(path);
        return next;
      });
      // 依赖目录折叠，展开才读；已读过的也重读一次，拿到最新的内容
      if (willOpen) void load(path);
    },
    [load],
  );

  const entryAt = useCallback((path: TreePath): FileEntry | null => {
    for (const entries of latest.current.dirs.values()) {
      const found = entries.find((entry) => entry.path === path);
      if (found !== undefined) return found;
    }
    return null;
  }, []);

  const startCreate = useCallback(
    (kind: "file" | "folder", parent: TreePath) => {
      if (parent !== "") toggle(parent, true);
      setDraftError(null);
      setDraft({ mode: "create", kind, parent });
    },
    [toggle],
  );
  const startRename = useCallback((path: TreePath) => {
    setDraftError(null);
    setDraft({ mode: "rename", path });
  }, []);
  const cancelDraft = useCallback(() => {
    setDraft(null);
    setDraftError(null);
  }, []);

  const commitDraft = useCallback(
    async (name: string) => {
      const current = latest.current.draft;
      if (current === null || busy.current) return;
      if (current.mode === "rename" && name === baseNameOf(current.path)) {
        cancelDraft();
        return;
      }
      busy.current = true;
      try {
        const result =
          current.mode === "create"
            ? await bridge.call("files.create", {
                project,
                path: current.parent,
                kind: current.kind,
                name,
              })
            : await bridge.call("files.rename", { project, path: current.path, name });
        if (!alive.current) return;
        if (!result.ok) {
          setDraftError(result.error);
          return;
        }
        const path = result.value.path;
        cancelDraft();
        setSelected(path);
        setFocused(path);
        if (current.mode === "create") {
          await load(current.parent);
          if (current.kind === "file") latest.current.host.openFile(path);
        } else {
          const from = current.path;
          const was = entryAt(from);
          if (was?.kind === "folder") {
            setExpanded((prev) => remapPrefix(prev, from, path));
            setDirs((prev) => new Map([...prev].filter(([key]) => !isInside(key, from))));
            if (latest.current.expanded.has(from)) void load(path);
          }
          latest.current.host.onRenamed?.(from, path);
          await load(parentOf(from));
        }
      } finally {
        busy.current = false;
      }
    },
    [bridge, project, load, cancelDraft, entryAt],
  );

  const trash = useCallback(
    async (path: TreePath) => {
      const entry = entryAt(path);
      const unsaved =
        entry?.kind === "file" ? latest.current.host.unsavedContent?.(path) : undefined;
      const result = await bridge.call("files.trash", {
        project,
        path,
        ...(unsaved === undefined ? {} : { unsaved }),
      });
      if (!alive.current) return;
      if (!result.ok) {
        showNotice({ type: "error", error: result.error });
        return;
      }
      latest.current.host.onTrashed?.(path);
      setSelected(null);
      setFocused(parentOf(path) === "" ? null : parentOf(path));
      setExpanded((prev) => new Set([...prev].filter((key) => !isInside(key, path))));
      showNotice({ type: "trashed" });
      await load(parentOf(path));
    },
    [bridge, project, entryAt, load, showNotice],
  );

  return {
    dirs,
    expanded,
    selected,
    focused,
    draft,
    draftError,
    notice,
    rootLoaded: dirs.has(""),
    setFocused,
    select: setSelected,
    toggle,
    startCreate,
    startRename,
    cancelDraft,
    commitDraft,
    trash,
    entryAt,
  };
}
