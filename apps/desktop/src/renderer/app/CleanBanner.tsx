import { useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, Icon, UserText } from "@runyard/ui";
import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { CleanReminderItem, PlaygroundRow } from "../../shared/library-state.ts";
import styles from "./CleanBanner.module.css";
import { TrashConfirmDialog } from "./TrashConfirmDialog.tsx";
import { useWindowVisible } from "./use-window-visible.ts";

export interface CleanBannerProps {
  bridge: DesktopBridge;
  items: readonly CleanReminderItem[];
  playgrounds: readonly PlaygroundRow[];
}

// 资源库页顶部的自动清理提示条（设计稿 CleanReminder，规格 DESKTOP-LIBRARY-VIEW-57 至 60）：
// “N 个项目明天会被自动清理：名称（已 D 天没打开）。”加三个按钮。真正显示出来（窗口看得见）之后
// 才向主进程回报“提醒已显示”；“改为保留”保留提示条里的全部项目；“现在清理”逐个走移到废纸篓的确认；
// “稍后再说”只收起提示条，到下次打开应用前不再出现。
export function CleanBanner({ bridge, items, playgrounds }: CleanBannerProps) {
  const t = useT();
  const visible = useWindowVisible();
  const ids = items.map((item) => item.id);
  const key = ids.join("\n");
  useEffect(() => {
    if (visible && ids.length > 0) void bridge.call("clean.shown", ids);
  }, [bridge, visible, key]);
  // “现在清理”的确认队列：一个确认完再问下一个，取消就停
  const [queue, setQueue] = useState<readonly string[]>([]);
  const current = queue[0] === undefined ? undefined : playgrounds.find((p) => p.id === queue[0]);
  const next = () => setQueue((q) => q.slice(1));
  if (items.length === 0) return null;
  return (
    <>
      <section
        className={styles.root}
        role="status"
        aria-label={t("library.cleanBanner.region.aria")}
        data-clean-banner=""
      >
        <Icon name="clock" size={18} className={styles.icon} />
        <p className={styles.text}>
          {t("library.cleanBanner.lead.label", { count: items.length })}
          {items.map((item, index) => (
            <span key={item.id}>
              <UserText className={styles.name}>{item.name}</UserText>
              {t("library.cleanBanner.idle.label", { days: item.idleDays })}
              {index < items.length - 1
                ? t("library.cleanBanner.separator.label")
                : t("library.cleanBanner.end.label")}
            </span>
          ))}
        </p>
        <ButtonGroup size="md" className={styles.actions}>
          <Button variant="primary" onClick={() => void bridge.call("clean.keep", ids)}>
            {t("library.clean.keep.action")}
          </Button>
          <Button onClick={() => setQueue(ids)}>{t("library.clean.now.action")}</Button>
          <button
            type="button"
            className={styles.link}
            onClick={() => void bridge.call("clean.later", ids)}
          >
            {t("library.clean.later.action")}
          </button>
        </ButtonGroup>
      </section>
      <TrashConfirmDialog
        open={current !== undefined}
        name={current?.name ?? ""}
        running={current?.active ?? false}
        onConfirm={() => {
          if (current !== undefined) void bridge.call("playground.trash", current.id);
          next();
        }}
        onCancel={() => setQueue([])}
      />
    </>
  );
}
