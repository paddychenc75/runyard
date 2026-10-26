import { useT } from "@runyard/i18n/react";
import { StatusMark } from "@runyard/ui";
import type { DesktopError } from "../../shared/library-state.ts";
import styles from "./ScriptOutput.module.css";
import { useErrorText } from "./use-error-text.ts";

// 脚本没能启动（找不到解释器、启动命令出错）：输出区写明原因，下面列已有的最后几行输出
// （规格 DESKTOP-WORKSPACE-41）；原因的句子由错误码经文案包生成。
export function ScriptFailure({ failure }: { failure: DesktopError }) {
  const t = useT();
  const errorText = useErrorText();
  return (
    <div className={styles.failure} role="alert" data-script-failure={failure.code}>
      <p className={styles.failureTitle}>
        <StatusMark status="crashed" size="hero" />
        {errorText(failure, "title")}
      </p>
      {/* 脚本没有“就绪”：通用的“进程在就绪之前就退出了”只对网页和服务成立 */}
      <p className={styles.failureBody}>
        {failure.code === "RUN_FAILED"
          ? t("desktop.script.startFailed.body")
          : errorText(failure, "body")}
      </p>
      <p className={styles.failureBody}>{errorText(failure, "hint")}</p>
    </div>
  );
}
