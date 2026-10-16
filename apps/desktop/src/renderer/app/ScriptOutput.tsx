import { useT } from "@runyard/i18n/react";
import { StatusMark } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { ConsoleOutput } from "./ConsoleOutput.tsx";
import { RunActionButton } from "./RunActionButton.tsx";
import styles from "./ScriptOutput.module.css";
import { useRunStatus } from "./use-run-status.ts";

export interface ScriptOutputProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 脚本项目没有预览，右侧是输出（设计稿 Script、ScriptRunning、ScriptFailed）：头部是状态
// （运行中 · 已 3.2 秒 / 已结束 · 退出码 0 · 0.18 秒）和停止、运行按钮，下面是进程输出。
// “保存后自动运行”开关、输入行和“过期”标记属于脚本工作区，不在 #176 范围。
export function ScriptOutput({ bridge, tab }: ScriptOutputProps) {
  const t = useT();
  const status = useRunStatus(tab);
  return (
    <section
      className={styles.root}
      data-script-output={tab.id}
      aria-label={t("desktop.output.aria")}
    >
      <header className={styles.header}>
        <StatusMark
          status={status.mark}
          className={styles.status}
          data-danger={status.danger || undefined}
        >
          {status.text}
        </StatusMark>
        <RunActionButton bridge={bridge} tab={tab} />
      </header>
      <ConsoleOutput bridge={bridge} playground={tab.id} className={styles.log} />
    </section>
  );
}
