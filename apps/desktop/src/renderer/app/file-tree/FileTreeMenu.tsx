import { useT } from "@runyard/i18n/react";
import { Menu, type MenuEntry } from "@runyard/ui";
import { useEffect } from "react";
import { useContentVisible } from "../../shared/content-visibility.ts";
import { useOverlay } from "../../shared/overlay-context.tsx";
import styles from "./FileTree.module.css";
import type { TreePath } from "./file-tree-model.ts";

/** 右键菜单或快捷键菜单作用在谁身上：一个条目，或项目根（空白处、标题行的按钮） */
export interface MenuTarget {
  /** 屏幕坐标：菜单贴着这个点出现 */
  x: number;
  y: number;
  /** 作用的条目路径；null 是项目根 */
  path: TreePath | null;
}

export interface FileTreeMenuProps {
  target: MenuTarget | null;
  onSelect: (id: "newFile" | "newFolder" | "rename" | "trash") => void;
  onClose: () => void;
}

// 文件树的菜单（设计稿 RowMenu 的样式：同一个 Menu 组件）。位置由一个不可见的锚点决定，
// 所以右键、菜单键、Shift+F10 都能用同一个菜单。新建项放在被点的文件夹里（点的是文件就放在它旁边）。
export function FileTreeMenu({ target, onSelect, onClose }: FileTreeMenuProps) {
  const t = useT();
  const visible = useContentVisible();
  const open = visible && target !== null;
  useEffect(() => {
    if (!visible && target !== null) onClose();
  }, [visible, target, onClose]);
  useOverlay(open);
  const entries: MenuEntry[] = [
    { id: "newFile", label: t("workspace.files.newFile.action") },
    { id: "newFolder", label: t("workspace.files.newFolder.action") },
    ...(target?.path == null
      ? []
      : [
          { type: "separator" } as const,
          {
            id: "rename",
            label: t("workspace.files.renameItem.action"),
            hint: t("workspace.files.renameItem.hint"),
          },
          {
            id: "trash",
            label: t("workspace.files.trashItem.action"),
            tone: "danger" as const,
          },
        ]),
  ];
  return (
    <Menu
      label={t("workspace.files.menu.aria")}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      trigger={
        <span
          aria-hidden="true"
          className={styles.menuAnchor}
          style={
            {
              "--anchor-x": `${target?.x ?? 0}px`,
              "--anchor-y": `${target?.y ?? 0}px`,
            } as React.CSSProperties
          }
        />
      }
      entries={entries}
      onSelect={(id) => visible && onSelect(id as "newFile" | "newFolder" | "rename" | "trash")}
    />
  );
}
