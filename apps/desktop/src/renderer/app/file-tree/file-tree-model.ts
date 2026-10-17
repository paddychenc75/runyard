import type { FileChange, FileEntry } from "../../../shared/editor-files.ts";

// 文件树的纯逻辑（规格 desktop/editor 的文件树场景）：把“各文件夹的列表加展开集合”摊成可见的行，
// 并回答键盘移动、哪些文件夹要重读、改名后展开状态怎么跟着走。没有界面和桥，便于单独测。

/** 项目内相对路径，项目根是空串 */
export type TreePath = string;

export interface TreeEntryRow {
  type: "entry";
  entry: FileEntry;
  depth: number;
  expanded: boolean;
  /** 展开了但这个文件夹的列表还没读回来 */
  loading: boolean;
}

/** 正在输入名字的行：新建（挂在 parent 下第一个位置）或重命名（替换原来的那一行） */
export type EditDraft =
  | { mode: "create"; kind: "file" | "folder"; parent: TreePath }
  | { mode: "rename"; path: TreePath };

export interface TreeDraftRow {
  type: "draft";
  draft: EditDraft;
  depth: number;
  /** 重命名时是原来的条目，用来画图标和填初值；新建没有 */
  entry: FileEntry | null;
  kind: "file" | "folder";
}

export type TreeRow = TreeEntryRow | TreeDraftRow;

export interface TreeData {
  /** 已读过的文件夹：路径到它的直接子项（已排好序，文件夹在前） */
  dirs: ReadonlyMap<TreePath, readonly FileEntry[]>;
  expanded: ReadonlySet<TreePath>;
}

export function parentOf(path: TreePath): TreePath {
  const at = path.lastIndexOf("/");
  return at === -1 ? "" : path.slice(0, at);
}

export function baseNameOf(path: TreePath): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function joinPath(parent: TreePath, name: string): TreePath {
  return parent === "" ? name : `${parent}/${name}`;
}

/** path 是否在 folder 里面（含 folder 自己） */
export function isInside(path: TreePath, folder: TreePath): boolean {
  return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** 树里不显示的文件夹（规格 DESKTOP-EDITOR-02）：文件服务已经滤掉，这里再认一次，不依赖服务的实现 */
const HIDDEN_NAMES = new Set([".runyard", ".git"]);

export function visibleRows(data: TreeData, draft: EditDraft | null): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (folder: TreePath, depth: number) => {
    if (draft?.mode === "create" && draft.parent === folder) {
      rows.push({ type: "draft", draft, depth, entry: null, kind: draft.kind });
    }
    for (const entry of data.dirs.get(folder) ?? []) {
      if (HIDDEN_NAMES.has(entry.name)) continue;
      if (draft?.mode === "rename" && draft.path === entry.path) {
        rows.push({ type: "draft", draft, depth, entry, kind: entry.kind });
      } else {
        const expanded = entry.kind === "folder" && data.expanded.has(entry.path);
        rows.push({
          type: "entry",
          entry,
          depth,
          expanded,
          loading: expanded && !data.dirs.has(entry.path),
        });
      }
      if (entry.kind === "folder" && data.expanded.has(entry.path)) walk(entry.path, depth + 1);
    }
  };
  walk("", 0);
  return rows;
}

export function rowPath(row: TreeRow): TreePath | null {
  if (row.type === "entry") return row.entry.path;
  return row.draft.mode === "rename" ? row.draft.path : null;
}

export type NavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

/**
 * 方向键怎么移动焦点（WAI-ARIA 树的约定）：上下逐行，右键展开或进入第一个子项，左键收起或回到父文件夹，
 * Home/End 到头尾。返回要做的事：移到哪个路径，或展开、收起某个文件夹。
 */
export type NavAction =
  | { type: "focus"; path: TreePath }
  | { type: "expand"; path: TreePath }
  | { type: "collapse"; path: TreePath }
  | { type: "none" };

export function navigate(
  rows: readonly TreeRow[],
  current: TreePath | null,
  key: NavKey,
): NavAction {
  const entries = rows.filter((row): row is TreeEntryRow => row.type === "entry");
  if (entries.length === 0) return { type: "none" };
  const at = entries.findIndex((row) => row.entry.path === current);
  const focusAt = (index: number): NavAction => {
    const target = entries[Math.max(0, Math.min(entries.length - 1, index))];
    return target === undefined ? { type: "none" } : { type: "focus", path: target.entry.path };
  };
  if (key === "Home") return focusAt(0);
  if (key === "End") return focusAt(entries.length - 1);
  if (at === -1) return focusAt(0);
  const row = entries[at];
  if (row === undefined) return { type: "none" };
  if (key === "ArrowDown") return focusAt(at + 1);
  if (key === "ArrowUp") return focusAt(at - 1);
  if (key === "ArrowRight") {
    if (row.entry.kind !== "folder") return { type: "none" };
    if (!row.expanded) return { type: "expand", path: row.entry.path };
    const next = entries[at + 1];
    return next !== undefined && next.depth > row.depth
      ? { type: "focus", path: next.entry.path }
      : { type: "none" };
  }
  if (row.expanded) return { type: "collapse", path: row.entry.path };
  const parent = parentOf(row.entry.path);
  return parent === "" ? { type: "none" } : { type: "focus", path: parent };
}

/** 磁盘变化之后哪些已读过的文件夹要重读：变化路径的父文件夹，以及被移走的文件夹自己（它的缓存作废） */
export function foldersToReload(
  changes: readonly FileChange[],
  loaded: ReadonlySet<TreePath>,
): TreePath[] {
  const wanted = new Set<TreePath>();
  for (const change of changes) {
    const parent = parentOf(change.path);
    if (loaded.has(parent)) wanted.add(parent);
    // 目录被整个换掉（删除后重建、改名后）时它自己也要重读
    if (loaded.has(change.path)) wanted.add(change.path);
  }
  return [...wanted];
}

/** 文件夹改名后，展开集合里以旧路径开头的路径换成新前缀 */
export function remapPrefix(
  paths: ReadonlySet<TreePath>,
  from: TreePath,
  to: TreePath,
): Set<TreePath> {
  const next = new Set<TreePath>();
  for (const path of paths) {
    if (path === from) next.add(to);
    else if (path.startsWith(`${from}/`)) next.add(`${to}${path.slice(from.length)}`);
    else next.add(path);
  }
  return next;
}

/** 新建文件夹或文件时放在哪：选中的是文件夹就放进去，选中的是文件就放在它旁边，没选就放项目根 */
export function createParentFor(selected: FileEntry | null): TreePath {
  if (selected === null) return "";
  return selected.kind === "folder" ? selected.path : parentOf(selected.path);
}
