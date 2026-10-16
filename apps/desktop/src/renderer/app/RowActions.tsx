import { useT } from "@runyard/i18n/react";
import { Button, IconButton, Menu, type MenuEntry } from "@runyard/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow } from "../../shared/library-state.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./RowActions.module.css";

export interface RowActionsProps {
  bridge: DesktopBridge;
  row: PlaygroundRow;
}

// 列表一行的操作（规格 desktop/library-view“打开与停止运行”“更多菜单里的访达与路径”）：
// 主操作随状态变，已停止是“打开”（打开即运行，没有“运行但不打开”），运行中是“停止运行”；
// 后面是“更多”菜单。菜单项只有规格批准的几项，设计稿里其余的（重命名、编辑备注、移到废纸篓等）随后续 issue。
export function RowActions({ bridge, row }: RowActionsProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  // 菜单是网页层，盖在原生预览之上，打开期间预览要让位（技术设计 §6.1）
  useOverlay(menuOpen);

  const open = () => void bridge.call("tab.open", row.id);
  const stop = () => void bridge.call("run.stop", row.id);
  const entries: MenuEntry[] = [
    { id: "open", label: t("library.row.open.action"), hint: t("library.row.openHint.label") },
    ...(row.active ? [{ id: "stop", label: t("library.row.stop.action") }] : []),
    { type: "separator" },
    { id: "reveal", label: t("library.row.reveal.action") },
    { id: "copyPath", label: t("library.row.copyPath.action") },
  ];
  const onSelect = (id: string) => {
    if (id === "open") open();
    else if (id === "stop") stop();
    else if (id === "reveal") void bridge.call("playground.reveal", row.id);
    else if (id === "copyPath") void bridge.call("playground.copyPath", row.id);
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
    </div>
  );
}
