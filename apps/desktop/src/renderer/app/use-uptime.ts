import { useT } from "@runyard/i18n/react";
import { uptimeParts } from "./uptime.ts";

/** 已运行时长的文字：47 分钟、2 小时 14 分钟、3 天 */
export function useUptime(): (ms: number) => string {
  const t = useT();
  return (ms) => {
    const parts = uptimeParts(ms);
    if (parts.unit === "minutes") return t("format.duration.minutes", { count: parts.minutes });
    if (parts.unit === "days") return t("format.duration.days", { count: parts.days });
    return t("workspace.duration.hoursMinutes.label", {
      hours: t("format.duration.hours", { count: parts.hours }),
      minutes: t("format.duration.minutes", { count: parts.minutes }),
    });
  };
}
