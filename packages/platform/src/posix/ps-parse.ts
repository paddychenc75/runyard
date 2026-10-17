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

const PS_ENV_LINE =
  /^\s*(\d+)\s+(\d+)\s+([A-Za-z]{3} [A-Za-z]{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4})(?:\s(.*))?$/;

/** `text` 里有没有一个以空白分隔的整词恰好是 `name=value`（命令行参数或环境变量） */
export function hasEnvToken(text: string, name: string, value: string): boolean {
  const needle = `${name}=${value}`;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? " " : (text[at - 1] ?? " ");
    const after = text[at + needle.length] ?? " ";
    if (/\s/.test(before) && /\s/.test(after)) return true;
    from = at + 1;
  }
}

/**
 * `ps eww -A -o pid=,pgid=,lstart=,command=` 的输出：macOS 把环境直接接在命令后面，中间只有空格，
 * 所以只能按“整词等于 name=value”来认（值里有空格时按字面连续匹配）。
 * 读不到环境的进程（受系统保护的程序）只有命令，不会命中
 */
export function parsePsWithEnv(output: string, name: string, value: string): ProcessEntry[] {
  const entries: ProcessEntry[] = [];
  for (const line of output.split("\n")) {
    const match = PS_ENV_LINE.exec(line);
    if (!match || !hasEnvToken(match[4] ?? "", name, value)) continue;
    const startTime = parseLstart(match[3] ?? "");
    if (startTime === null) continue;
    entries.push({ pid: Number(match[1]), pgid: Number(match[2]), startTime });
  }
  return entries;
}

const PS_TTY_LINE = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/;

/**
 * `ps -A -o pid=,pgid=,tdev=,lstart=` 的输出里与 pid 共用控制终端的进程（含 pid 自己）。
 * tdev 是终端设备号（macOS 上形如 `16/12`），没有控制终端是 `??`（或 `-`）。
 * macOS 的 ps 没有可用的会话号（sess 恒为 0），所以按终端设备号认同一个终端会话里的进程
 */
export function parsePsTerminalPeers(output: string, pid: number): ProcessEntry[] {
  const rows: { entry: ProcessEntry; tdev: string }[] = [];
  for (const line of output.split("\n")) {
    const match = PS_TTY_LINE.exec(line);
    if (!match) continue;
    const startTime = parseLstart(match[4] ?? "");
    if (startTime === null) continue;
    rows.push({
      entry: { pid: Number(match[1]), pgid: Number(match[2]), startTime },
      tdev: match[3] ?? "",
    });
  }
  const mine = rows.find((row) => row.entry.pid === pid)?.tdev;
  if (mine === undefined || mine === "??" || mine === "-") return [];
  return rows.filter((row) => row.tdev === mine).map((row) => row.entry);
}
