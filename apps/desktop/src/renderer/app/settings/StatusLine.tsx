import type { Localized } from "@runyard/i18n";
import { Icon, StatusMark } from "@runyard/ui";
import styles from "./StatusLine.module.css";

export type StatusTone = "ok" | "idle" | "warn" | "danger";

export interface StatusLineProps {
  tone: StatusTone;
  children: Localized;
  /** 小号次要文字色加小状态点：“命令行与智能体”一组所有行统一用它（设计稿方案 A） */
  quiet?: boolean;
}

// 设置页里一行状态：绿点加文字（可用、已找到）、空心圈加文字（未安装、未运行）、黄点或警示图标加文字
// （版本过低、有新版本）、红色圆圈叉加文字（失败）。形状不同，不只靠颜色。
export function StatusLine({ tone, children, quiet = false }: StatusLineProps) {
  if (quiet) {
    return (
      <span className={styles.quiet} data-tone={tone}>
        <span className={styles.dot} aria-hidden="true">
          {tone === "danger" ? <Icon name="close" size={8} /> : null}
        </span>
        {children}
      </span>
    );
  }
  if (tone === "warn") {
    return (
      <span className={styles.warn}>
        <Icon name="warning" size={12} />
        {children}
      </span>
    );
  }
  return (
    <StatusMark status={tone === "ok" ? "running" : tone === "danger" ? "crashed" : "stopped"}>
      {children}
    </StatusMark>
  );
}
