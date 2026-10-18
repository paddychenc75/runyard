import { useT } from "@runyard/i18n/react";
import { GlassSurface, IconButton, ScrollArea } from "@runyard/ui";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { FileEntry } from "../../../shared/editor-files.ts";
import { useWorkspaceFiles } from "../../shared/workspace-files.tsx";
import { PaneToggleButton } from "../PaneToggleButton.tsx";
import styles from "./FileTree.module.css";
import { EntryIcon, toneOf } from "./FileTreeGlyph.tsx";
import { FileTreeMenu, type MenuTarget } from "./FileTreeMenu.tsx";
import { FileTreeNameInput } from "./FileTreeNameInput.tsx";
import { FileTreeRow } from "./FileTreeRow.tsx";
import { createParentFor, type NavKey, navigate, rowPath, visibleRows } from "./file-tree-model.ts";
import { useFileErrorText } from "./use-file-error-text.ts";
import { type FileTreeHost, useFileTree } from "./use-file-tree.ts";

/** 打开哪个文件走 WorkspaceFilesContext；这三件事是文件树对文件标签的额外要求，编辑器接进来时提供 */
export type FileTreeHooks = Pick<FileTreeHost, "unsavedContent" | "onRenamed" | "onTrashed">;

export interface FileTreeProps {
  bridge: DesktopBridge;
  /** 项目 id（文件服务按它找项目文件夹） */
  project: string;
  hooks?: FileTreeHooks;
  /** 给了就在标题行画“收起文件树”按钮（规格 DESKTOP-WORKSPACE-60） */
  onCollapse?: () => void;
}

// 按路径找行：路径里可能有引号等字符，不拼进选择器
function rowElement(root: HTMLElement | null, path: string): HTMLElement | null {
  const rows = root?.querySelectorAll<HTMLElement>("[data-path]") ?? [];
  return [...rows].find((row) => row.dataset.path === path) ?? null;
}

const NAV_KEYS: readonly string[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
];

// 项目标签页左边的文件树（设计稿 Web、Script 的“文件”面板，规格 desktop/editor 文件树）：
// 玻璃面板，标题行加“新建”，下面是树；只用键盘就能操作全部动作，焦点所在的行始终画出焦点环。
export function FileTree({ bridge, project, hooks, onCollapse }: FileTreeProps) {
  const workspace = useWorkspaceFiles();
  const host = useMemo<FileTreeHost>(
    () => ({ activePath: workspace.activePath, openFile: workspace.openFile, ...hooks }),
    [workspace.activePath, workspace.openFile, hooks],
  );
  const t = useT();
  const errorText = useFileErrorText();
  const tree = useFileTree(bridge, project, host);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () => visibleRows({ dirs: tree.dirs, expanded: tree.expanded }, tree.draft),
    [tree.dirs, tree.expanded, tree.draft],
  );
  const paths = rows.flatMap((row) => rowPath(row) ?? []);
  // 能用 Tab 进来的只有一行：焦点所在的，没有就第一行
  const tabbable = tree.focused !== null && paths.includes(tree.focused) ? tree.focused : paths[0];

  // 焦点的移动靠状态驱动：状态变了之后把真正的焦点移到那一行
  const moveTo = useCallback(
    (path: string) => {
      tree.setFocused(path);
      rowElement(treeRef.current, path)?.focus();
    },
    [tree.setFocused],
  );
  // 打开着的文件要看得见（设计稿 Web：src 展开、App.tsx 是强调色实底）：它所在的文件夹逐级展开
  const { activePath } = workspace;
  const { toggle: toggleDir } = tree;
  useEffect(() => {
    if (activePath === null) return;
    const parts = activePath.split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth++)
      toggleDir(parts.slice(0, depth).join("/"), true);
  }, [activePath, toggleDir]);
  // 新建、改名、移走之后焦点回到树里（输入框消失时它会丢焦点）
  const draftOpen = tree.draft !== null;
  const returnTo = tree.focused;
  const wasDrafting = useRef(false);
  useEffect(() => {
    if (wasDrafting.current && !draftOpen && returnTo !== null) moveTo(returnTo);
    wasDrafting.current = draftOpen;
  }, [draftOpen, returnTo, moveTo]);

  const activate = (entry: FileEntry) => {
    tree.select(entry.path);
    if (entry.kind === "folder") tree.toggle(entry.path);
    else host.openFile(entry.path);
  };

  // 右键只是给菜单指个目标：菜单没选任何项就关了，选中状态要回到右键之前（issue #443），不留一块灰底
  const beforeMenu = useRef<{ selected: string | null; chosen: boolean }>({
    selected: null,
    chosen: false,
  });
  const openMenu = (path: string | null, x: number, y: number) => {
    beforeMenu.current = { selected: tree.selected, chosen: false };
    if (path !== null) tree.select(path);
    setMenu({ x, y, path });
  };
  const closeMenu = () => {
    if (!beforeMenu.current.chosen) tree.select(beforeMenu.current.selected);
    beforeMenu.current.chosen = true;
    setMenu(null);
  };

  const onMenuSelect = (id: "newFile" | "newFolder" | "rename" | "trash") => {
    const path = menu?.path ?? null;
    beforeMenu.current.chosen = true;
    setMenu(null);
    if (id === "rename" && path !== null) tree.startRename(path);
    else if (id === "trash" && path !== null) void tree.trash(path);
    else if (id === "newFile" || id === "newFolder") {
      const parent = path === null ? "" : createParentFor(tree.entryAt(path));
      tree.startCreate(id === "newFile" ? "file" : "folder", parent);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const path = tree.focused;
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      const action = navigate(rows, path, event.key as NavKey);
      if (action.type === "focus") moveTo(action.path);
      else if (action.type === "expand") tree.toggle(action.path, true);
      else if (action.type === "collapse") tree.toggle(action.path, false);
      return;
    }
    if (path === null) return;
    const entry = tree.entryAt(path);
    if (entry === null) return;
    if (event.key === "F2") {
      event.preventDefault();
      tree.startRename(path);
    } else if (event.key === "Backspace" && event.metaKey) {
      event.preventDefault();
      void tree.trash(path);
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const box = rowElement(event.currentTarget, path)?.getBoundingClientRect();
      openMenu(path, (box?.left ?? 0) + 24, box?.bottom ?? 0);
    }
  };

  const problem = tree.draftError === null ? null : errorText(tree.draftError);
  const empty = tree.rootLoaded && rows.length === 0;
  return (
    <>
      <GlassSurface material="filetree" className={styles.root}>
        <div className={styles.head}>
          <span className={styles.title}>{t("workspace.files.title.label")}</span>
          {onCollapse === undefined ? null : (
            <PaneToggleButton
              label={t("workspace.files.collapse.label")}
              expanded
              onClick={onCollapse}
            />
          )}
          <IconButton
            icon="plus"
            size="sm"
            label={t("workspace.files.add.aria")}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setMenu({ x: box.right, y: box.bottom, path: null });
            }}
          />
        </div>
        <ScrollArea className={styles.scroll}>
          <div
            ref={treeRef}
            role="tree"
            aria-label={t("workspace.files.tree.aria")}
            className={styles.tree}
            onKeyDown={onKeyDown}
            onContextMenu={(event) => {
              // 空白处：菜单作用在项目根（落在行上的事件由行自己处理并阻止冒泡前的默认行为）
              if (event.defaultPrevented) return;
              event.preventDefault();
              openMenu(null, event.clientX, event.clientY);
            }}
          >
            {rows.map((row) =>
              row.type === "entry" ? (
                <FileTreeRow
                  key={row.entry.path}
                  row={row}
                  active={host.activePath === row.entry.path}
                  selected={tree.selected === row.entry.path}
                  tabbable={tabbable === row.entry.path}
                  onActivate={(target) => activate(target.entry)}
                  onFocus={tree.setFocused}
                  onContextMenu={(target, x, y) => openMenu(target.entry.path, x, y)}
                />
              ) : (
                <div
                  key={`draft-${row.draft.mode}`}
                  role="treeitem"
                  aria-selected="true"
                  tabIndex={-1}
                  aria-level={row.depth + 1}
                  className={styles.draft}
                  data-has-problem={problem === null ? undefined : ""}
                  style={{ "--tree-depth": row.depth } as React.CSSProperties}
                >
                  <span className={styles.chevron} />
                  <span className={styles.icon} data-tone={toneOf({ name: "", kind: row.kind })}>
                    <EntryIcon kind={row.kind} tone={toneOf({ name: "", kind: row.kind })} />
                  </span>
                  <FileTreeNameInput
                    draft={row.draft}
                    problem={problem === null ? null : String(problem)}
                    onSubmit={(name) => void tree.commitDraft(name)}
                    onCancel={tree.cancelDraft}
                  />
                </div>
              ),
            )}
            {empty ? <p className={styles.empty}>{t("workspace.files.empty.hint")}</p> : null}
          </div>
        </ScrollArea>
        {tree.notice === null ? null : (
          <div
            role="status"
            aria-label={t("workspace.files.notice.aria")}
            className={styles.notice}
            data-tone={tree.notice.type === "error" ? "danger" : "neutral"}
          >
            {tree.notice.type === "trashed"
              ? t("workspace.files.trashed.hint")
              : errorText(tree.notice.error)}
          </div>
        )}
      </GlassSurface>
      {/* 菜单锚点用 fixed 定位；玻璃面板有 backdrop-filter，会成为 fixed 的参照，所以菜单要放在面板外面 */}
      <FileTreeMenu target={menu} onSelect={onMenuSelect} onClose={closeMenu} />
    </>
  );
}
