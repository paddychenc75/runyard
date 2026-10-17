import { Truncate, UserText } from "@runyard/ui";
import type { CSSProperties } from "react";
import styles from "./FileTree.module.css";
import { Chevron, EntryIcon, toneOf } from "./FileTreeGlyph.tsx";
import type { TreeEntryRow } from "./file-tree-model.ts";

export interface FileTreeRowProps {
  row: TreeEntryRow;
  /** 编辑器里打开着它：蓝色高亮（设计稿 Web 的 App.tsx） */
  active: boolean;
  selected: boolean;
  tabbable: boolean;
  onActivate: (row: TreeEntryRow) => void;
  onFocus: (path: string) => void;
  onContextMenu: (row: TreeEntryRow, x: number, y: number) => void;
}

// 一行：折叠箭头（文件夹才有）、图标、名字。整行是一个按钮样的树项，行高 28（--size-tree-row）。
export function FileTreeRow({
  row,
  active,
  selected,
  tabbable,
  onActivate,
  onFocus,
  onContextMenu,
}: FileTreeRowProps) {
  const { entry } = row;
  const isFolder = entry.kind === "folder";
  return (
    <div
      role="treeitem"
      tabIndex={tabbable ? 0 : -1}
      aria-level={row.depth + 1}
      aria-expanded={isFolder ? row.expanded : undefined}
      aria-selected={selected}
      aria-current={active ? "true" : undefined}
      data-path={entry.path}
      data-kind={entry.kind}
      data-active={active ? "" : undefined}
      data-selected={selected ? "" : undefined}
      className={styles.row}
      style={{ "--tree-depth": row.depth } as CSSProperties}
      onClick={() => onActivate(row)}
      onKeyDown={(event) => {
        // 回车：文件打开，文件夹展开或收起；输入框里的回车不走这里（输入框自己拦下了）
        if (event.key !== "Enter") return;
        event.preventDefault();
        onActivate(row);
      }}
      onFocus={() => onFocus(entry.path)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(row, event.clientX, event.clientY);
      }}
    >
      <span className={styles.chevron}>
        <Chevron visible={isFolder} open={row.expanded} />
      </span>
      <span className={styles.icon} data-tone={toneOf(entry)}>
        <EntryIcon kind={entry.kind} tone={toneOf(entry)} />
      </span>
      <Truncate className={styles.name} data-folder={isFolder ? "" : undefined}>
        <UserText>{entry.name}</UserText>
      </Truncate>
    </div>
  );
}
