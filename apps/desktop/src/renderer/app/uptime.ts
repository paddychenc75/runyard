// “已运行 2 小时 14 分钟”里的时长：一天以内写成“小时 分钟”两段，更久只写天；纯计算，文字由调用方经文案包生成

export type UptimeParts =
  | { unit: "minutes"; minutes: number }
  | { unit: "hoursMinutes"; hours: number; minutes: number }
  | { unit: "days"; days: number };

export function uptimeParts(ms: number): UptimeParts {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return { unit: "minutes", minutes };
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return { unit: "days", days: Math.floor(hours / 24) };
  return { unit: "hoursMinutes", hours, minutes: minutes % 60 };
}
