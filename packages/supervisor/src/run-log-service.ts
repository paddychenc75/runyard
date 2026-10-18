import { cleanLogEntries } from "@runyard/core";
import type { AbsPath, Platform } from "@runyard/platform";
import type { LogEntry, RunState } from "@runyard/protocol";
import {
  listRunLogFiles,
  pruneRunLogs,
  readRunLogFile,
  runLogFileName,
  runLogPath,
} from "./run-log-files.ts";
import { RunLogRing } from "./run-log-ring.ts";
import { RunLogWriter } from "./run-log-writer.ts";
import type { Session } from "./session.ts";

// 运行日志：把每次运行产生的条目记进内存环形缓冲和磁盘文件，按项目读取、跟随、清除（规格 run/logs）。
// 每个项目只在内存里留最近一次运行；更早的运行只在磁盘上，读取只涉及“最近一次”，
// 游标属于更早的运行就当作掐掉了（RUN-LOGS-17）。管理进程重启后，最近一次从磁盘读回来（RUN-LOGS-20）。

export interface RunLogServiceDeps {
  readonly platform: Platform;
  /** 运行日志所在的目录（状态目录下的 logs/） */
  readonly dir: AbsPath;
  /** 这次运行属于哪个项目；不认识的运行不记 */
  playgroundOf(runId: string): string | undefined;
  /** 项目最近一次运行的状态；管理进程重启后没有 */
  stateOf(playgroundId: string): RunState | undefined;
}

export interface ReadLogsOptions {
  readonly since?: string;
  readonly tail?: number;
  readonly raw?: boolean;
}

export interface ReadLogsResult {
  readonly entries: LogEntry[];
  readonly cursor: string;
  readonly truncated: boolean;
  readonly state?: RunState;
}

interface Bucket {
  readonly runId: string;
  readonly ring: RunLogRing;
  /** 从磁盘读回来的只读；这次管理进程运行里产生的才有 */
  readonly writer: RunLogWriter | undefined;
}

interface Follower {
  readonly session: Session;
  readonly sub: number;
  readonly playgroundId: string;
  readonly raw: boolean;
}

/** 项目从没运行过时的游标：不属于任何运行，读取时不算“来自更早的运行” */
const NO_RUN_CURSOR = "none:0";

export class RunLogService {
  readonly #deps: RunLogServiceDeps;
  readonly #buckets = new Map<string, Bucket>();
  readonly #loading = new Map<string, Promise<Bucket | undefined>>();
  readonly #followers = new Set<Follower>();

  constructor(deps: RunLogServiceDeps) {
    this.#deps = deps;
  }

  /** 记一条日志。同步返回，写盘在后台排队 */
  record(runId: string, entry: LogEntry): void {
    const playgroundId = this.#deps.playgroundOf(runId);
    if (playgroundId === undefined) return;
    let bucket = this.#buckets.get(playgroundId);
    // 引擎保证同一个项目的新运行在旧运行停完之后才开始，所以出现新的 runId 就是新的一次运行
    if (bucket?.runId !== runId) bucket = this.#begin(playgroundId, runId);
    const seq = bucket.ring.nextSeq();
    const text = `${JSON.stringify({ ...entry, seq })}\n`;
    bucket.ring.push({ seq, entry, bytes: Buffer.byteLength(text) });
    bucket.writer?.append(text);
    this.#deliver(playgroundId, entry);
  }

  /**
   * 一次运行开始了：它就是这个项目“最近一次运行”，哪怕还没产生任何输出。
   * 没产生输出就失败的运行（缺工具、版本过低）不调用 record，要是不在这里登记，读取会一直读到上一次运行的输出，
   * 把旧输出当成这次的结果显示给用户。
   */
  beginRun(runId: string): void {
    const playgroundId = this.#deps.playgroundOf(runId);
    if (playgroundId === undefined) return;
    if (this.#buckets.get(playgroundId)?.runId === runId) return;
    const bucket = this.#begin(playgroundId, runId);
    // 空文件也要落盘：管理进程重启后“最近一次”从磁盘读回来，不能退回到上一次运行的文件
    bucket.writer?.clear();
  }

  async read(playgroundId: string, options: ReadLogsOptions = {}): Promise<ReadLogsResult> {
    const state = this.#deps.stateOf(playgroundId);
    const withState = (result: Omit<ReadLogsResult, "state">): ReadLogsResult =>
      state === undefined ? result : { ...result, state };
    const bucket = await this.#latest(playgroundId);
    if (bucket === undefined) {
      return withState({ entries: [], cursor: NO_RUN_CURSOR, truncated: false });
    }
    const { ring } = bucket;
    let lines = ring.lines();
    let truncated = false;
    const since = parseCursor(options.since);
    if (since !== undefined && since.runId !== "none") {
      if (since.runId !== bucket.runId) {
        // 游标来自更早的一次运行：给当前运行的全部，并告诉调用方中间有东西没法接上
        truncated = true;
      } else {
        // 游标之后的内容里有已经被掐掉的，也是接不上
        truncated = since.seq + 1 < ring.firstSeq;
        lines = lines.filter((line) => line.seq > since.seq);
      }
    }
    let entries = lines.map((line) => line.entry);
    if (options.raw !== true) entries = cleanLogEntries(entries);
    if (options.tail !== undefined) entries = entries.slice(-options.tail);
    return withState({ entries, cursor: `${bucket.runId}:${ring.lastSeq}`, truncated });
  }

  /** 订阅新条目：之后的每一条经 run.log 事件推给这个订阅；订阅由调用方在会话上建好 */
  follow(session: Session, sub: number, playgroundId: string, raw: boolean): void {
    this.#followers.add({ session, sub, playgroundId, raw });
  }

  /** 清除一个项目的日志：正在写的这一次清空内存和文件（序号继续），更早的文件删掉 */
  async clear(playgroundId: string): Promise<void> {
    const bucket = await this.#latest(playgroundId);
    const { platform, dir } = this.#deps;
    for (const file of await listRunLogFiles(platform, dir, playgroundId)) {
      if (file.runId === bucket?.runId && bucket.writer !== undefined) continue;
      await platform.fs.removeFile(runLogPath(dir, file.name));
    }
    if (bucket === undefined) return;
    if (bucket.writer === undefined) {
      this.#buckets.delete(playgroundId);
      return;
    }
    bucket.ring.clear();
    bucket.writer.clear();
  }

  /** 等排队的磁盘写入都落下（关闭管理进程前；测试里读文件前） */
  async flush(): Promise<void> {
    await Promise.all(
      [...this.#buckets.values()].map((bucket) => bucket.writer?.flush() ?? Promise.resolve()),
    );
  }

  #begin(playgroundId: string, runId: string): Bucket {
    const { platform, dir } = this.#deps;
    const writer = new RunLogWriter(
      platform,
      dir,
      runLogPath(dir, runLogFileName(runId, playgroundId)),
    );
    // 清理和这次运行的写入排在同一条队里，所以第 6 次运行的文件出现之前最旧的已经删了
    // 上一次运行的写入可能还没落盘（它的文件还不在目录里），等它写完再数
    const previous = this.#buckets.get(playgroundId)?.writer;
    writer.enqueue(async () => {
      await previous?.flush();
      await platform.fs.makeDir(dir);
      await pruneRunLogs(platform, dir, playgroundId, runId);
    });
    const bucket: Bucket = { runId, ring: new RunLogRing(), writer };
    this.#buckets.set(playgroundId, bucket);
    return bucket;
  }

  // 内存里没有就从磁盘读最近一次；同时来的几个读取共用一次读盘
  #latest(playgroundId: string): Promise<Bucket | undefined> {
    const existing = this.#buckets.get(playgroundId);
    if (existing !== undefined) return Promise.resolve(existing);
    const loading = this.#loading.get(playgroundId);
    if (loading !== undefined) return loading;
    const load = this.#loadFromDisk(playgroundId).finally(() => this.#loading.delete(playgroundId));
    this.#loading.set(playgroundId, load);
    return load;
  }

  async #loadFromDisk(playgroundId: string): Promise<Bucket | undefined> {
    const { platform, dir } = this.#deps;
    const files = await listRunLogFiles(platform, dir, playgroundId);
    const newest = files[files.length - 1];
    // 读盘期间这个项目开始了新的运行：以内存里的为准
    if (newest === undefined) return this.#buckets.get(playgroundId);
    const lines = await readRunLogFile(platform, runLogPath(dir, newest.name));
    const current = this.#buckets.get(playgroundId);
    if (current !== undefined) return current;
    const ring = new RunLogRing();
    ring.load(
      lines.map((line) => {
        const { seq, ...entry } = line;
        return {
          seq,
          entry: entry as LogEntry,
          bytes: Buffer.byteLength(JSON.stringify(line)) + 1,
        };
      }),
    );
    const bucket: Bucket = { runId: newest.runId, ring, writer: undefined };
    this.#buckets.set(playgroundId, bucket);
    return bucket;
  }

  #deliver(playgroundId: string, entry: LogEntry): void {
    for (const follower of this.#followers) {
      if (!follower.session.hasSubscription(follower.sub)) {
        this.#followers.delete(follower);
        continue;
      }
      if (follower.playgroundId !== playgroundId) continue;
      const [shown] = follower.raw ? [entry] : cleanLogEntries([entry]);
      if (shown !== undefined) follower.session.deliverTo(follower.sub, "run.log", shown);
    }
  }
}

// 游标 <runId>:<序号>，对调用方不透明。登记表只保证形状；形状对但认不得的运行 id
// 一律当作来自更早的运行
function parseCursor(cursor: string | undefined): { runId: string; seq: number } | undefined {
  if (cursor === undefined) return undefined;
  const at = cursor.lastIndexOf(":");
  if (at <= 0) return undefined;
  const seq = Number(cursor.slice(at + 1));
  if (!Number.isSafeInteger(seq)) return undefined;
  return { runId: cursor.slice(0, at), seq };
}
