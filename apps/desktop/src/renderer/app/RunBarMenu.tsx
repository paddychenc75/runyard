import { useT } from "@runyard/i18n/react";
import { IconButton, Menu } from "@runyard/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow } from "../../shared/library-state.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import { useNow } from "./use-now.ts";
import { useProjectMenu } from "./use-project-menu.tsx";

export interface RunBarMenuProps {
  bridge: DesktopBridge;
  row: PlaygroundRow;
  taken: readonly string[];
}

const CLOCK_INTERVAL_MS = 30_000;

// 运行条最右的“更多”菜单（设计稿 WorkspaceMenu）：和资源库行菜单共用同一份菜单项（usePlaygroundEdits）。
// 项和顺序同设计稿：重命名到移到废纸篓，没有“打开”那一组。
// 工作区里没有表格行，“重命名…”和“编辑备注…”开小弹窗（规格 DESKTOP-WORKSPACE-29）。
export function RunBarMenu({ bridge, row, taken }: RunBarMenuProps) {
  const t = useT();
  const now = useNow(CLOCK_INTERVAL_MS);
  const [open, setOpen] = useState(false);
  // 菜单是网页层，盖在原生预览之上，打开期间预览要让位（技术设计 §6.1）
  useOverlay(open);
  const menu = useProjectMenu({ bridge, row, taken, now });
  const label = t("library.row.more.aria", { name: row.name });
  return (
    <>
      <Menu
        label={label}
        trigger={<IconButton icon="more" size="sm" label={label} />}
        entries={menu.entries}
        onSelect={menu.select}
        onOpenChange={setOpen}
      />
      {menu.dialogs}
    </>
  );
}
