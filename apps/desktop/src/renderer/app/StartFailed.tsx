import { useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, StatusMark, StepList, type StepListItem } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError, TabRow } from "../../shared/library-state.ts";
import { ConsoleOutput } from "./ConsoleOutput.tsx";
import styles from "./FailureScreen.module.css";
import { failedStepOf, focusConsoleOutput, type StartStep } from "./failure-view.ts";
import { useErrorText } from "./use-error-text.ts";

export interface StartFailedProps {
  bridge: DesktopBridge;
  tab: TabRow;
  failure: DesktopError;
}

const STEPS: readonly StartStep[] = ["copy", "install", "start", "ready"];
// 日志摘要只放最后几行；完整输出在页面底部的控制台
const TAIL_LINES = 8;

// 启动没成功的画面（设计稿 StartFailed 的“依赖安装失败”，规格 DESKTOP-WORKSPACE-19）：
// 启动清单停在失败的那一步并标红，下面是输出的最后几行，操作是“重试”和“查看完整输出”。
// 文字由错误码经文案包生成，这里不写句子；缺工具另有画面（MissingTool）。
export function StartFailed({ bridge, tab, failure }: StartFailedProps) {
  const t = useT();
  const errorText = useErrorText();
  const failedStep = failedStepOf(failure.code);
  const stepLabel = (step: StartStep) => {
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
  const failedIndex = failedStep === null ? -1 : STEPS.indexOf(failedStep);
  const steps: StepListItem[] = STEPS.map((step, index) => ({
    id: step,
    label: stepLabel(step),
    status: index < failedIndex ? "done" : index === failedIndex ? "failed" : "pending",
  }));
  return (
    <div
      className={styles.root}
      data-failure-screen="start-failed"
      data-failure-code={failure.code}
    >
      <div className={styles.head}>
        <StatusMark status="crashed" size="hero" />
        <div className={styles.heading}>
          <h2 className={styles.title}>{errorText(failure, "title")}</h2>
          <p className={styles.description}>{errorText(failure, "body")}</p>
        </div>
      </div>
      {failedStep === null ? null : (
        <StepList steps={steps} label={t("desktop.failure.steps.aria")} />
      )}
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>{t("desktop.failure.log.label")}</h3>
        <ConsoleOutput
          bridge={bridge}
          playground={tab.id}
          className={styles.log}
          tail={TAIL_LINES}
        />
      </section>
      <p className={styles.description}>{errorText(failure, "hint")}</p>
      <ButtonGroup size="md" className={styles.actions}>
        <Button
          variant="primary"
          disabled={tab.busy}
          onClick={() => void bridge.call("run.start", tab.id)}
        >
          {t("desktop.failure.retry.action")}
        </Button>
        <Button onClick={focusConsoleOutput}>{t("desktop.output.view.action")}</Button>
      </ButtonGroup>
    </div>
  );
}
