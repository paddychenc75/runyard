import { useT } from "@runyard/i18n/react";
import { Button, SegmentedControl } from "@runyard/ui";
import { useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { useCommand } from "../shared/command-host.tsx";
import { ConsoleOutput } from "./ConsoleOutput.tsx";
import styles from "./ConsolePanel.module.css";

export interface ConsolePanelProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 标签页底部的控制台（设计稿 Service 的“输出”）：实时显示这次运行的进程输出，
// 包括安装和启动阶段。“终端”页签不在 #176 范围；“清除”见规格 DESKTOP-WORKSPACE-42（见 PR 的“与设计稿的差异”）。
export function ConsolePanel({ bridge, tab }: ConsolePanelProps) {
  const t = useT();
  const root = useRef<HTMLElement>(null);
  // 命令面板的“显示输出”（规格“命令面板”）：底部现在只有“输出”一页，把焦点放进日志，方向键就能翻看；
  // “终端”页签随 #263 加入后，这条命令负责切回“输出”
  useCommand("app.showOutput", () =>
    root.current?.querySelector<HTMLElement>('[role="log"]')?.focus(),
  );
  return (
    <section ref={root} className={styles.root} data-console={tab.id}>
      <header className={styles.header}>
        {/* 终端页签随终端的界面（#263）才能点；先灰着，位置和设计稿一致 */}
        <SegmentedControl
          label={t("desktop.console.tabs.aria")}
          items={[
            { value: "output", label: t("desktop.console.tab.label") },
            { value: "terminal", label: t("desktop.console.terminal.label"), disabled: true },
          ]}
          value="output"
          onValueChange={() => {}}
        />
        <Button size="sm" onClick={() => void bridge.call("console.clear", tab.id)}>
          {t("desktop.console.clear.action")}
        </Button>
      </header>
      <ConsoleOutput bridge={bridge} playground={tab.id} className={styles.log} />
    </section>
  );
}
