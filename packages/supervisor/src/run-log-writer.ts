import type { AbsPath, Platform } from "@runyard/platform";
import { keepLastLines, RUN_LOG_MAX_BYTES, RUN_LOG_TRIM_TO_BYTES } from "./run-log-files.ts";

// 一个运行日志文件的写入。所有磁盘操作排成一条队，所以追加、掐头、清空不会交错；
// 写的时候不等：调用方 append 完立刻返回，队里积压的行合成一次追加。
// 写日志失败不能拖垮管理进程（磁盘满了、目录被删了），所以任务里的错误一律吞掉；
// 内存里的环形缓冲不受影响，这次运行照常能读到。

export interface RunLogWriterOptions {
  readonly maxBytes?: number;
  readonly trimToBytes?: number;
}

export class RunLogWriter {
  readonly #platform: Platform;
  readonly #dir: AbsPath;
  readonly #file: AbsPath;
  readonly #maxBytes: number;
  readonly #trimToBytes: number;
  #pending: string[] = [];
  #drainScheduled = false;
  #tail: Promise<void> = Promise.resolve();
  #size = 0;
  #dirReady = false;

  constructor(platform: Platform, dir: AbsPath, file: AbsPath, options: RunLogWriterOptions = {}) {
    this.#platform = platform;
    this.#dir = dir;
    this.#file = file;
    this.#maxBytes = options.maxBytes ?? RUN_LOG_MAX_BYTES;
    this.#trimToBytes = options.trimToBytes ?? RUN_LOG_TRIM_TO_BYTES;
  }

  /** 追加一行（已含换行）。不等写完 */
  append(line: string): void {
    this.#pending.push(line);
    if (this.#drainScheduled) return;
    this.#drainScheduled = true;
    this.enqueue(() => this.#drain());
  }

  /** 清空这个文件。之前追加的、还没写出去的行一并丢掉 */
  clear(): void {
    this.#pending = [];
    this.enqueue(async () => {
      await this.#ensureDir();
      await this.#platform.fs.writeFile(this.#file, "");
      this.#size = 0;
    });
  }

  /** 排进同一条队的其他磁盘操作（例如开始新一次运行时清理更早的日志） */
  enqueue(task: () => Promise<void>): void {
    this.#tail = this.#tail.then(task).catch(() => undefined);
  }

  /** 等排在前面的都做完 */
  flush(): Promise<void> {
    return this.#tail;
  }

  async #ensureDir(): Promise<void> {
    if (this.#dirReady) return;
    await this.#platform.fs.makeDir(this.#dir);
    this.#dirReady = true;
  }

  async #drain(): Promise<void> {
    this.#drainScheduled = false;
    const batch = this.#pending.join("");
    this.#pending = [];
    if (batch === "") return;
    await this.#ensureDir();
    await this.#platform.fs.appendFile(this.#file, batch);
    this.#size += Buffer.byteLength(batch);
    if (this.#size > this.#maxBytes) await this.#trim();
  }

  async #trim(): Promise<void> {
    const bytes = await this.#platform.fs.readBytes(this.#file);
    if (bytes === null) return;
    const kept = keepLastLines(bytes, this.#trimToBytes);
    await this.#platform.fs.writeAtomic(this.#file, new TextDecoder().decode(kept));
    this.#size = kept.length;
  }
}
