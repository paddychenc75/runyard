import { useT } from "@runyard/i18n/react";
import { Icon } from "@runyard/ui";
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
        <Icon name="close" size={16} />
        {errorText(failure, "title")}
      </p>
      <p className={styles.failureBody}>{errorText(failure, "body")}</p>
      <p className={styles.failureBody}>{errorText(failure, "hint")}</p>
      <p className={styles.failureLabel}>{t("desktop.script.failedTail.label")}</p>
    </div>
  );
}
