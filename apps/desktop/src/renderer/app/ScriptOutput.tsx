import { useT } from "@runyard/i18n/react";
import { Button, Icon } from "@runyard/ui";
import { useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { useSettings } from "../bridge/use-settings.ts";
import { useCommand } from "../shared/command-host.tsx";
import { ConsoleOutput } from "./ConsoleOutput.tsx";
import { RunActionButton } from "./RunActionButton.tsx";
import { ScriptAutoRun } from "./ScriptAutoRun.tsx";
import { ScriptFailure } from "./ScriptFailure.tsx";
import { ScriptInput } from "./ScriptInput.tsx";
import styles from "./ScriptOutput.module.css";

export interface ScriptOutputProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 启动失败时输出区只列最后几行；完整输出在日志里
const TAIL_LINES = 12;

// 脚本项目没有预览，右侧是输出（设计稿 Script、ScriptRunning、ScriptStale、ScriptFailed）：
// 头部只有“保存后自动运行”开关、清除和运行、停止按钮（语法错误时有“过期”标记）；
// 状态（运行中 · 已 3.2 秒 / 已结束 · 退出码 0 · 0.18 秒）只在顶栏的运行条里写一次，不在这里重复（问题单 R1）；中间是进程输出；底部是输入行。
export function ScriptOutput({ bridge, tab }: ScriptOutputProps) {
  const t = useT();
  const root = useRef<HTMLElement>(null);
  useCommand("app.showOutput", () =>
    root.current?.querySelector<HTMLElement>('[role="log"]')?.focus(),
  );
  const { settings } = useSettings(bridge);
  const failure = tab.failure;
  return (
    <section
      ref={root}
      className={styles.root}
      data-script-output={tab.id}
      aria-label={t("desktop.output.aria")}
    >
      <header className={styles.header}>
        {tab.stale ? <span className={styles.stale}>{t("desktop.script.stale.label")}</span> : null}
        <span className={styles.spacer} />
        {/* 设置还没读到时按开处理，读到之后跟着变 */}
        <ScriptAutoRun bridge={bridge} tab={tab} globalOn={settings?.scriptAutoRun ?? true} />
        <Button size="sm" onClick={() => void bridge.call("console.clear", tab.id)}>
          {t("desktop.console.clear.action")}
        </Button>
        <RunActionButton bridge={bridge} tab={tab} />
      </header>
      {tab.stale ? (
        <p className={styles.staleNotice} role="status" data-script-stale="">
          <Icon name="warning" size={16} />
          {t("desktop.script.staleNotice.label")}
        </p>
      ) : null}
      {failure === null ? null : <ScriptFailure failure={failure} />}
      <ConsoleOutput
        bridge={bridge}
        playground={tab.id}
        className={styles.log}
        quietWhenEmpty={failure !== null}
        {...(failure === null
          ? {}
          : {
              heading: (
                <p className={styles.failureLabel}>{t("desktop.script.failedTail.label")}</p>
              ),
            })}
        {...(failure === null ? {} : { tail: TAIL_LINES })}
      />
      <ScriptInput bridge={bridge} tab={tab} />
    </section>
  );
}
