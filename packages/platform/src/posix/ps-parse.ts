import type { ProcessEntry } from "./process-source.ts";

// ps 输出的解析（纯函数，任何系统上都能测）。调用方必须用 TZ=UTC、LC_ALL=C 运行 ps，
// 否则 lstart 的月份和时区随用户设置变化。

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LSTART = /^[A-Za-z]{3} ([A-Za-z]{3}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;

/** `Mon Oct 12 03:38:34 2026`（UTC）转成毫秒。精度只到秒，这是 macOS 的 ps 能给的最细值 */
export function parseLstart(text: string): number | null {
  const match = LSTART.exec(text.trim());
  if (!match) return null;
  const [, month, day, hour, minute, second, year] = match;
  const monthIndex = MONTHS.indexOf(month ?? "");
  if (monthIndex === -1) return null;
  return Date.UTC(
    Number(year),
    monthIndex,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

/** `ps -A -o pid=,pgid=,lstart=` 的输出。读不懂的行跳过 */
export function parsePsList(output: string): ProcessEntry[] {
  const entries: ProcessEntry[] = [];
  for (const line of output.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const startTime = parseLstart(match[3] ?? "");
    if (startTime === null) continue;
    entries.push({ pid: Number(match[1]), pgid: Number(match[2]), startTime });
  }
  return entries;
}
