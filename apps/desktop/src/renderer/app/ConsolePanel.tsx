import { useT } from "@runyard/i18n/react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { ConsoleOutput } from "./ConsoleOutput.tsx";
import styles from "./ConsolePanel.module.css";

export interface ConsolePanelProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 标签页底部的控制台（设计稿 Service 的“输出”）：实时显示这次运行的进程输出，
// 包括安装和启动阶段。“终端”页签和“清除”不在 #176 范围（见 PR 的“与设计稿的差异”）。
export function ConsolePanel({ bridge, tab }: ConsolePanelProps) {
  const t = useT();
  return (
    <section className={styles.root} data-console={tab.id}>
      <header className={styles.header}>
        <h2 className={styles.tab}>{t("desktop.console.tab.label")}</h2>
      </header>
      <ConsoleOutput bridge={bridge} playground={tab.id} className={styles.log} />
    </section>
  );
}
