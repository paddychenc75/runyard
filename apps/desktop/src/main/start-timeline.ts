import type { RunSnapshot, RunState } from "@runyard/protocol";
import type { StartPhaseMs } from "../shared/library-state.ts";

const NONE: StartPhaseMs = { copy: null, install: null, start: null };

interface RunTimes {
  runId: string;
  /** 每个状态第一次被看到的时间 */
  entered: Map<RunState, number>;
  copyMs: number | null;
}

// 启动清单每一步用了多久。管理进程的运行快照里没有逐状态的时间，所以主进程在每次重读时
// 记下“这个状态第一次被看到”的时刻：事件一到就重读，误差是一次往返。
// 复制模板文件发生在运行开始之前，用创建请求自己的耗时（`noteCopy`），只属于紧接着的那一次运行。
export class StartTimeline {
  readonly #runs = new Map<string, RunTimes>();
  readonly #pendingCopy = new Map<string, number>();

  /** 创建请求花的时间（含复制模板文件），记给这个项目的下一次运行 */
  noteCopy(playgroundId: string, ms: number): void {
    this.#pendingCopy.set(playgroundId, ms);
  }

  /** 每次读到最新的运行列表时调用，`latest` 是每个项目最近一次运行 */
  observe(latest: ReadonlyMap<string, RunSnapshot>, now: number): void {
    for (const [playgroundId, run] of latest) {
      let times = this.#runs.get(playgroundId);
      if (times === undefined || times.runId !== run.runId) {
        times = {
          runId: run.runId,
          entered: new Map(),
          copyMs: this.#pendingCopy.get(playgroundId) ?? null,
        };
        this.#pendingCopy.delete(playgroundId);
        this.#runs.set(playgroundId, times);
      }
      if (!times.entered.has(run.state)) times.entered.set(run.state, now);
    }
  }

  forget(playgroundId: string): void {
    this.#runs.delete(playgroundId);
    this.#pendingCopy.delete(playgroundId);
  }

  phases(playgroundId: string): StartPhaseMs {
    const times = this.#runs.get(playgroundId);
    if (times === undefined) return NONE;
    const span = (from: RunState, to: RunState): number | null => {
      const start = times.entered.get(from);
      const end = times.entered.get(to);
      return start === undefined || end === undefined ? null : Math.max(0, end - start);
    };
    return {
      copy: times.copyMs,
      install: span("installing", "starting"),
      start: span("starting", "ready"),
    };
  }
}
