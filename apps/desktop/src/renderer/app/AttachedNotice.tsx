import { useFormat, useT } from "@runyard/i18n/react";
import { Button, Icon, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import styles from "./AttachedNotice.module.css";
import { useNow } from "./use-now.ts";

export interface AttachedNoticeProps {
  bridge: DesktopBridge;
  tab: TabRow;
  /** 命令行持有的运行（TabRow.attached，调用方已判断不是 null） */
  attached: NonNullable<TabRow["attached"]>;
}

// 命令行持有的运行的查看画面（设计稿 AttachedRun，规格 DESKTOP-WORKSPACE-48 至 50）：预览区上方的一条说明，
// 写明谁、多久前通过命令行启动；“改为由我管理”把持有者改成这个标签页，“停止”停掉这次运行（标签页留着）。
// 打开它不重启运行，持有者仍是命令行。
export function AttachedNotice({ bridge, tab, attached }: AttachedNoticeProps) {
  const t = useT();
  const format = useFormat();
  const now = useNow(30_000);
  const ago = format.relativeTime(attached.startedAt, now);
  return (
    <section
      className={styles.root}
      aria-label={t("workspace.attached.aria")}
      data-attached={tab.id}
    >
      <span aria-hidden="true" className={styles.icon}>
        <Icon name="spark" size={18} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>
          {attached.agent === null ? (
            t("workspace.attached.titlePlain.label", { ago })
          ) : (
            <UserText>{t("workspace.attached.title", { agent: attached.agent, ago })}</UserText>
          )}
        </p>
        <p className={styles.hint}>{t("workspace.attached.hint")}</p>
      </div>
      <div className={styles.actions}>
        <Button size="sm" disabled={tab.busy} onClick={() => void bridge.call("run.adopt", tab.id)}>
          {t("workspace.attached.adopt.action")}
        </Button>
        <Button
          size="sm"
          icon="stop"
          disabled={tab.busy}
          onClick={() => void bridge.call("run.stop", tab.id)}
        >
          {t("workspace.attached.stop.action")}
        </Button>
      </div>
    </section>
  );
}
