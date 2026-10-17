import type { Localized } from "@runyard/i18n";
import { Icon, StatusMark } from "@runyard/ui";
import styles from "./StatusLine.module.css";

export type StatusTone = "ok" | "idle" | "warn";

// 设置页里一行状态：绿点加文字（可用、已找到）、空心圈加文字（未安装、未运行）、警示图标加文字（版本过低、位置被占用）。
export function StatusLine({ tone, children }: { tone: StatusTone; children: Localized }) {
  if (tone === "warn") {
    return (
      <span className={styles.warn}>
        <Icon name="warning" size={12} />
        {children}
      </span>
    );
  }
  return <StatusMark status={tone === "ok" ? "running" : "stopped"}>{children}</StatusMark>;
}
