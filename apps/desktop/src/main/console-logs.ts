import type { RunyardClient } from "@runyard/client";
import type { ConsoleAppend, ConsoleLine } from "../shared/console-state.ts";
import { mergeConsoleLines } from "../shared/console-state.ts";

// 每个打开的标签页的控制台数据：主进程替界面订阅管理进程的日志，把读到的行留在这里。
// 订阅的事件只当“有新东西了”的信号，内容每次都用 logs.read 按游标取（同命令行的 logs --follow），
// 这样订阅登记前后的缝隙里不会丢行也不会重复。行留在主进程，界面切走再回来、
// 重新挂载时用 console.get 取回（规格 DESKTOP-WORKSPACE-17）。

export type ConsoleClient = Pick<RunyardClient, "call" | "followLogs">;

/** 第一次读取最多要最近多少行；更早的在日志文件里，要看用命令行 */
export const INITIAL_TAIL = 1000;
/** 每个项目在内存里最多留多少行，超出的丢最早的 */
export const MAX_LINES = 5000;

interface Watch {
  lines: ConsoleLine[];
  nextSeq: number;
  cursor: string | undefined;
  unsubscribe: (() => Promise<void>) | undefined;
  reading: Promise<void> | undefined;
  readAgain: boolean;
  ready: Promise<void>;
  closed: boolean;
}

export class ConsoleLogs {
  readonly #client: ConsoleClient;
  readonly #listeners = new Set<(append: ConsoleAppend) => void>();
  readonly #watches = new Map<string, Watch>();

  constructor(client: ConsoleClient) {
    this.#client = client;
  }

  onAppend(listener: (append: ConsoleAppend) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 开始跟一个项目的输出；已经在跟就什么也不做。返回时第一次读取已经完成 */
  watch(playground: string): Promise<void> {
    const existing = this.#watches.get(playground);
    if (existing !== undefined) return existing.ready;
    const watch: Watch = {
      lines: [],
      nextSeq: 1,
      cursor: undefined,
      unsubscribe: undefined,
      reading: undefined,
      readAgain: false,
      ready: Promise.resolve(),
      closed: false,
    };
    this.#watches.set(playground, watch);
    watch.ready = (async () => {
      try {
        const subscription = await this.#client.followLogs({ playground }, () => {
          // 读失败（连接断了）不该变成未处理的拒绝；下一次信号会再读
          void this.#read(playground, watch).catch(() => undefined);
        });
        watch.unsubscribe = subscription.unsubscribe;
        if (watch.closed) await subscription.unsubscribe();
        await this.#read(playground, watch);
      } catch {
        // 管理进程暂时连不上：控制台保持原样，下一次状态变化或重新打开时再试
        if (this.#watches.get(playground) === watch) this.#watches.delete(playground);
      }
    })();
    return watch.ready;
  }

  /** 每个项目控制台最后对齐过的运行 id */
  readonly #syncedRuns = new Map<string, string>();

  /** 各标签页的项目最近一次运行换了新的（运行 id 变了）就重读；没换不碰 */
  async syncRuns(
    latest: ReadonlyMap<string, { runId: string }>,
    playgrounds: readonly string[],
  ): Promise<void> {
    for (const id of playgrounds) {
      const runId = latest.get(id)?.runId;
      if (runId === undefined || this.#syncedRuns.get(id) === runId) continue;
      this.#syncedRuns.set(id, runId);
      await this.sync(id);
    }
  }

  /**
   * 这个项目开了新的一次运行：重读一次。运行没产生输出就失败（缺工具）时不会有新行的信号，
   * 不重读的话界面还留着上一次运行的输出，像是这次的结果
   */
  async sync(playground: string): Promise<void> {
    const watch = this.#watches.get(playground);
    if (watch === undefined) return;
    await watch.ready;
    await this.#read(playground, watch).catch(() => undefined);
  }

  /** “清除”：这次运行已有的行不再显示，之后的新输出照常接上（游标不动，只取更新的） */
  clear(playground: string): void {
    const watch = this.#watches.get(playground);
    if (watch === undefined) return;
    watch.lines = [];
    for (const listener of this.#listeners) listener({ playground, lines: [], reset: true });
  }

  /** 标签页没了（项目被删）：取消订阅，丢掉行 */
  unwatch(playground: string): void {
    const watch = this.#watches.get(playground);
    if (watch === undefined) return;
    watch.closed = true;
    this.#watches.delete(playground);
    this.#syncedRuns.delete(playground);
    void watch.unsubscribe?.().catch(() => undefined);
  }

  lines(playground: string): ConsoleLine[] {
    return [...(this.#watches.get(playground)?.lines ?? [])];
  }

  /** 读取合并：正在读时再来信号，读完后补读一次 */
  #read(playground: string, watch: Watch): Promise<void> {
    if (watch.reading !== undefined) {
      watch.readAgain = true;
      return watch.reading;
    }
    const reading = (async () => {
      do {
        watch.readAgain = false;
        await this.#readOnce(playground, watch);
      } while (watch.readAgain && !watch.closed);
    })().finally(() => {
      watch.reading = undefined;
    });
    watch.reading = reading;
    return reading;
  }

  async #readOnce(playground: string, watch: Watch): Promise<void> {
    const first = watch.cursor === undefined;
    const result = await this.#client.call("logs.read", {
      playground,
      ...(first ? { tail: INITIAL_TAIL } : { since: watch.cursor }),
    });
    if (watch.closed) return;
    watch.cursor = result.cursor;
    // 游标属于更早一次运行（停止后再次运行）时管理进程返回当前运行的全部并标 truncated：整体替换
    const reset = first || result.truncated;
    const added: ConsoleLine[] = result.entries.map((entry) => ({ seq: watch.nextSeq++, entry }));
    if (!reset && added.length === 0) return;
    watch.lines = mergeConsoleLines(watch.lines, added, reset);
    if (watch.lines.length > MAX_LINES) watch.lines.splice(0, watch.lines.length - MAX_LINES);
    const lines = reset ? [...watch.lines] : added;
    for (const listener of this.#listeners) listener({ playground, lines, reset });
  }
}
