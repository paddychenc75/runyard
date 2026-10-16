import { type AbsPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import { type LogLine, parseLogLine } from "@runyard/protocol";

// 运行日志在磁盘上的位置和读写（决策记录 0008；storage.md 2.5）。
// 每次运行一个文件，直接放在 logs/ 下：<runId>.<playgroundId>.jsonl，一行一个 JSON（LogLine）。
// 文件名里带项目 id，是为了管理进程重启后还能按项目找到它的日志、按项目留最近 5 次；
// 运行编号按时间递增，`runyard doctor --bundle` 靠文件名从小到大取最近三次（不是 app.log、
// supervisor.log 及其轮转文件的就是运行日志）。

/** 磁盘上每次运行一个文件，不超过 10 MB（规格 RUN-LOGS-14） */
export const RUN_LOG_MAX_BYTES = 10 * 1024 * 1024;
/**
 * 超过上限时一次砍到这么大再继续写。砍到刚好 10 MB 的话，之后每写一行都要重写一遍文件；
 * 留出余量，文件始终不超过 10 MB，重写的次数少两个数量级
 */
export const RUN_LOG_TRIM_TO_BYTES = 9 * 1024 * 1024;
/** 每个项目保留最近几次运行的日志（含正在写的这一次；规格 RUN-LOGS-15） */
export const RUN_LOGS_KEPT_PER_PLAYGROUND = 5;

const FILE_NAME = /^([^.:\s]+)\.([^.:\s]+)\.jsonl$/;
const LF = 0x0a;

export interface RunLogFile {
  readonly name: string;
  readonly runId: string;
  readonly playgroundId: string;
}

export function runLogFileName(runId: string, playgroundId: string): string {
  return `${runId}.${playgroundId}.jsonl`;
}

export function parseRunLogFileName(name: string): RunLogFile | undefined {
  const match = FILE_NAME.exec(name);
  if (match === null) return undefined;
  return { name, runId: match[1] as string, playgroundId: match[2] as string };
}

// 运行 id 形如 run-<时间>-<序号>（都是 36 进制）：按数值比，而不是按字符串比，
// 序号位数不同（9 与 a、z 与 10）时字符串顺序会错
function runOrder(runId: string): readonly [number, number] | undefined {
  const match = /^run-([0-9a-z]+)(?:-([0-9a-z]+))?$/.exec(runId);
  if (match === null) return undefined;
  const first = Number.parseInt(match[1] as string, 36);
  if (match[2] === undefined) return [0, first];
  return [first, Number.parseInt(match[2], 36)];
}

/** 旧的在前 */
export function compareRunIds(a: string, b: string): number {
  const left = runOrder(a);
  const right = runOrder(b);
  if (left === undefined || right === undefined) return a < b ? -1 : a > b ? 1 : 0;
  return left[0] - right[0] || left[1] - right[1];
}

export function runLogPath(dir: AbsPath, name: string): AbsPath {
  return joinPath(dir, posixRelPath(name));
}

/** 某个项目的运行日志文件，旧的在前 */
export async function listRunLogFiles(
  platform: Platform,
  dir: AbsPath,
  playgroundId: string,
): Promise<RunLogFile[]> {
  const files: RunLogFile[] = [];
  for (const name of await platform.fs.listFiles(dir)) {
    const parsed = parseRunLogFileName(name);
    if (parsed?.playgroundId === playgroundId) files.push(parsed);
  }
  return files.sort((a, b) => compareRunIds(a.runId, b.runId));
}

/** 开始新一次运行时，把这个项目更早的日志只留最近几次（连新的一次共 5 次） */
export async function pruneRunLogs(
  platform: Platform,
  dir: AbsPath,
  playgroundId: string,
  currentRunId: string,
): Promise<void> {
  const older = (await listRunLogFiles(platform, dir, playgroundId)).filter(
    (file) => file.runId !== currentRunId,
  );
  const surplus = older.length - (RUN_LOGS_KEPT_PER_PLAYGROUND - 1);
  for (const file of older.slice(0, Math.max(0, surplus))) {
    await platform.fs.removeFile(runLogPath(dir, file.name));
  }
}

/** 读一个日志文件；崩溃留下的半行、坏行跳过 */
export async function readRunLogFile(platform: Platform, file: AbsPath): Promise<LogLine[]> {
  const text = await platform.fs.readText(file);
  if (text === null) return [];
  const lines: LogLine[] = [];
  for (const part of text.split("\n")) {
    if (part === "") continue;
    const parsed = parseLogLine(part);
    if (parsed.ok) lines.push(parsed.line);
  }
  return lines;
}

/** 从头部掐掉旧行，只留最后不超过 keepBytes 的整行 */
export function keepLastLines(bytes: Uint8Array, keepBytes: number): Uint8Array {
  if (bytes.length <= keepBytes) return bytes;
  const cut = bytes.length - keepBytes;
  // 从 cut 往后找第一个换行：它之后才是一整行的开头
  const newline = bytes.indexOf(LF, cut);
  return newline === -1 ? new Uint8Array(0) : bytes.subarray(newline + 1);
}
