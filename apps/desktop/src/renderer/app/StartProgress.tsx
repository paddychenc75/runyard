import { useFormat, useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, Icon } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { focusConsoleOutput, type StartStep } from "./failure-view.ts";
import styles from "./StartProgress.module.css";
import {
  lastOutputLine,
  START_STEPS,
  secondsWithTenths,
  startStatusesOf,
  stepMsOf,
} from "./start-view.ts";
import { useConsoleLines } from "./use-console-lines.ts";

export interface StartProgressProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 创建后（也包括再次点“运行”后）预览区的启动进度（设计稿 Creating，规格 DESKTOP-CREATE-FLOW-14）：
// 复制、安装、启动、就绪四步随运行状态推进，下面是最近一行输出；就绪后预览区换成页面。
// 失败交给失败画面（缺环境、依赖失败，#178），不在这里画。
export function StartProgress({ bridge, tab }: StartProgressProps) {
  const t = useT();
  const fmt = useFormat();
  const lines = useConsoleLines(bridge, tab.id);
  const tail = lastOutputLine(lines);
  const statuses = startStatusesOf(tab.state);
  const label = (step: StartStep) => {
    switch (step) {
      case "copy":
        return t("desktop.failure.stepCopy.label");
      case "install":
        return t("desktop.failure.stepInstall.label");
      case "start":
        return t("desktop.failure.stepStart.label");
      case "ready":
        return t("desktop.failure.stepReady.label");
    }
  };
  return (
    <div className={styles.root} data-start-progress={tab.id}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t("desktop.start.title", { name: tab.name })}</h2>
        <p className={styles.body}>{t("desktop.start.body", { folder: tab.folder })}</p>
      </div>
      <ol className={styles.steps} aria-label={t("desktop.failure.steps.aria")}>
        {START_STEPS.map((step) => {
          const status = statuses[step];
          const ms = status === "done" ? stepMsOf(step, tab.phaseMs) : null;
          return (
            <li
              key={step}
              className={styles.step}
              data-step={step}
              data-status={status}
              aria-current={status === "current" ? "step" : undefined}
            >
              <span aria-hidden="true" className={styles.mark}>
                {status === "done" ? <Icon name="check" size={14} /> : null}
              </span>
              <span className={styles.label}>{label(step)}</span>
              {status === "current" ? (
                <span className={styles.time}>{t("desktop.start.running.label")}</span>
              ) : ms === null ? null : (
                <span className={styles.time}>
                  {t("desktop.duration.seconds.label", {
                    seconds: fmt.number(secondsWithTenths(ms)),
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {tail === null ? null : <p className={styles.tail}>{tail}</p>}
      <ButtonGroup size="md" className={styles.actions}>
        <Button onClick={focusConsoleOutput}>{t("desktop.output.view.action")}</Button>
        <Button disabled={tab.busy} onClick={() => void bridge.call("run.stop", tab.id)}>
          {t("desktop.start.stop.action")}
        </Button>
        <span className={styles.hint}>{t("desktop.start.hint")}</span>
      </ButtonGroup>
    </div>
  );
}
