import { createHash } from "node:crypto";
import type { AbsPath, Disposable, Platform, WatchEvent } from "@runyard/platform";
import { joinPath, posixRelPath } from "@runyard/platform";
import type { FileChange } from "../../shared/editor-files.ts";

// 一个项目的文件监听（技术设计 §6.4，规格 DESKTOP-EDITOR-03、36）：
// 把平台层成批的变化整理成界面要的变化，并认出“是自己保存引起的”。
// 认法：保存时记下写入内容的摘要；之后这个路径来了变化事件，读磁盘现在的内容，摘要一致就是自己的，
// 否则是外部修改（外部程序紧接着改写成别的内容时，摘要对不上，不会被吞掉）。

/** 根目录下直接忽略的子路径：隐藏的内部文件夹、依赖目录和常见构建产物（不监听，省事件） */
export const IGNORED_AT_ROOT = [
  ".git",
  ".runyard",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".vite",
] as const;

/** 任意深度都不报告的目录段：嵌套的依赖目录和内部文件夹 */
const SILENT_SEGMENTS = new Set([".git", ".runyard", "node_modules"]);

// 平台层原子写入的临时文件名：`.<名字>.<12 位十六进制>.tmp`（packages/platform 的 write-atomic.ts）。
// 它们存在不到一眨眼，不是用户的文件，不能让目录树闪一下；命名改了的话，监听测试会发现临时文件漏进了事件
const ATOMIC_TEMP_NAME = /^\..+\.[0-9a-f]{12}\.tmp$/;

/** 自己写入的记录保留多久（毫秒）；过了就按外部处理，免得很久以前的同内容写入吞掉真的变化 */
const SELF_WRITE_TTL_MS = 5000;

export function digestOf(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface ChangeFeedDeps {
  readBytes: Platform["fs"]["readBytes"];
  now: () => number;
  /** 项目文件夹的真实路径，读磁盘现状时拼绝对路径用 */
  folder: AbsPath;
  emit: (changes: FileChange[]) => void;
}

export class ChangeFeed {
  readonly #deps: ChangeFeedDeps;
  // 每个路径最近自己写过的内容摘要（不止最后一次：先后两次保存的事件可能交错到达）
  readonly #selfWrites = new Map<string, { digest: string; at: number }[]>();
  #queue: Promise<void> = Promise.resolve();
  #handle: Disposable | null = null;
  #closed = false;

  constructor(deps: ChangeFeedDeps) {
    this.#deps = deps;
  }

  async start(watch: Platform["watch"]): Promise<void> {
    this.#handle = await watch(
      this.#deps.folder,
      { ignore: IGNORED_AT_ROOT.map((name) => posixRelPath(name)) },
      (events) => {
        // 逐批按顺序处理：读磁盘是异步的，不排队的话后到的批可能先发出去
        this.#queue = this.#queue.then(() => this.#process(events)).catch(() => {});
      },
    );
  }

  /**
   * 写入之前登记：内容摘要，路径是项目内相对路径。要在写之前登记，
   * 否则改名完成到登记之间到达的事件会被当成外部修改。写失败时用 forgetOwnWrite 撤销
   */
  noteOwnWrite(path: string, data: string): void {
    const now = this.#deps.now();
    const recent = (this.#selfWrites.get(path) ?? []).filter(
      (w) => now - w.at <= SELF_WRITE_TTL_MS,
    );
    recent.push({ digest: digestOf(data), at: now });
    this.#selfWrites.set(path, recent);
  }

  forgetOwnWrite(path: string, data: string): void {
    const digest = digestOf(data);
    const list = this.#selfWrites.get(path) ?? [];
    const index = list.findLastIndex((w) => w.digest === digest);
    if (index !== -1) list.splice(index, 1);
  }

  async stop(): Promise<void> {
    this.#closed = true;
    await this.#handle?.dispose();
    await this.#queue;
  }

  async #process(events: WatchEvent[]): Promise<void> {
    const changes: FileChange[] = [];
    for (const event of events) {
      const segments = event.path.split("/");
      if (segments.some((segment) => SILENT_SEGMENTS.has(segment))) continue;
      if (ATOMIC_TEMP_NAME.test(segments.at(-1) ?? "")) continue;
      changes.push({ kind: event.kind, path: event.path, self: await this.#isSelf(event) });
    }
    if (changes.length > 0 && !this.#closed) this.#deps.emit(changes);
  }

  async #isSelf(event: WatchEvent): Promise<boolean> {
    const now = this.#deps.now();
    const records = (this.#selfWrites.get(event.path) ?? []).filter(
      (w) => now - w.at <= SELF_WRITE_TTL_MS,
    );
    if (records.length === 0 || event.kind === "remove") return false;
    const bytes = await this.#deps
      .readBytes(joinPath(this.#deps.folder, posixRelPath(event.path)))
      .catch(() => null);
    if (bytes === null) return false;
    const current = digestOf(bytes);
    return records.some((w) => w.digest === current);
  }
}
