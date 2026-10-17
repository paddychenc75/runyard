import { useT } from "@runyard/i18n/react";
import { Button, IconButton, Menu, type MenuEntry } from "@runyard/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow } from "../../shared/library-state.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./RowActions.module.css";
import { useProjectMenu } from "./use-project-menu.tsx";
import type { RenameFocus } from "./use-rename-draft.ts";

export interface RowActionsProps {
  bridge: DesktopBridge;
  row: PlaygroundRow;
  /** 资源库里全部项目的名称（重名校验） */
  taken: readonly string[];
  now: number;
  /** 菜单的“重命名…”“编辑备注…”：这一行就地变成编辑状态 */
  onInlineRename: (row: PlaygroundRow, focus: RenameFocus) => void;
  /** 创建副本后选中它 */
  onDuplicated: (id: string) => void;
  /** 找不到文件夹的行菜单里的“重新定位…”：由表格统一处理（选错文件夹的说明显示在行下面） */
  onRelocate?: () => void;
}

// 列表一行的操作（规格 desktop/library-view“打开与停止运行”“更多菜单里的访达与路径”）：
// 主操作随状态变，已停止是“打开”（打开即运行，没有“运行但不打开”），运行中是“停止运行”；
// 后面是完整的“更多”菜单（设计稿 RowMenu）：打开、打开但不运行、停止运行，其余项与工作区共用 useProjectMenu。
export function RowActions({
  bridge,
  row,
  taken,
  now,
  onInlineRename,
  onDuplicated,
  onRelocate,
}: RowActionsProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  // 菜单是网页层，盖在原生预览之上，打开期间预览要让位（技术设计 §6.1）
  useOverlay(menuOpen);

  const menu = useProjectMenu({
    bridge,
    row,
    taken,
    now,
    onInlineRename: (focus) => onInlineRename(row, focus),
    onDuplicated,
    ...(onRelocate === undefined ? {} : { onRelocate }),
  });
  const open = () => void bridge.call("tab.open", row.id);
  const openWithoutRun = () => void bridge.call("tab.openWithoutRun", row.id);
  const stop = () => void bridge.call("run.stop", row.id);
  // 菜单顺序按设计稿 RowMenu（规格 DESKTOP-LIBRARY-VIEW“资源库行的完整更多菜单”）：
  // 找不到文件夹的行只有重新定位、从资源库移除、复制路径
  const entries: MenuEntry[] = row.missing
    ? menu.missingEntries
    : [
        { id: "open", label: t("library.row.open.action"), hint: t("library.row.openHint.label") },
        { id: "openOnly", label: t("library.row.openOnly.action") },
        ...(row.active ? [{ id: "stop", label: t("library.row.stop.action") }] : []),
        { type: "separator" },
        ...menu.entries,
      ];
  const onSelect = (id: string) => {
    if (menu.select(id)) return;
    if (id === "open") open();
    else if (id === "openOnly") openWithoutRun();
    else if (id === "stop") stop();
  };
  const moreLabel = t("library.row.more.aria", { name: row.name });
  return (
    <div className={styles.root}>
      <Button size="sm" disabled={row.busy} onClick={row.active ? stop : open}>
        {row.active ? t("library.row.stop.action") : t("library.row.open.action")}
      </Button>
      <Menu
        label={moreLabel}
        trigger={<IconButton icon="more" size="sm" label={moreLabel} />}
        entries={entries}
        onSelect={onSelect}
        onOpenChange={setMenuOpen}
      />
      {menu.dialogs}
    </div>
  );
}
