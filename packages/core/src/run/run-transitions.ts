import type { RunKind, RunState } from "@runyard/protocol";

// 状态转移表（docs/architecture/run-state-machine.md 第 1 节，规格 RUN-LIFECYCLE 第一条要求）。
// 表按运行种类分开：脚本没有 starting 和 ready，服务和页面没有 running。
// 其余的一律是非法转移：引擎内部碰到就是缺陷，抛错而不是悄悄接受。

/** 计入“N 个运行中”的状态：七种，不分持有者（规格 run/lifecycle 的“N 个运行中”一条） */
export const activeStates: readonly RunState[] = [
  "checking",
  "installing",
  "starting",
  "ready",
  "reloading",
  "running",
  "stopping",
];

/** 结束的状态：转移表里没有出路 */
export const endStates: readonly RunState[] = [
  "stopped",
  "finished",
  "errored",
  "crashed",
  "failed",
];

export function isActiveState(state: RunState): boolean {
  return activeStates.includes(state);
}

const serverTable: Record<RunState, readonly RunState[]> = {
  checking: ["installing", "starting", "failed", "stopping"],
  installing: ["starting", "failed", "stopping"],
  starting: ["ready", "failed", "stopping"],
  ready: ["reloading", "crashed", "stopping"],
  reloading: ["ready", "crashed", "stopping"],
  running: [],
  stopping: ["stopped"],
  stopped: [],
  finished: [],
  errored: [],
  crashed: [],
  failed: [],
};

const oneshotTable: Record<RunState, readonly RunState[]> = {
  checking: ["installing", "running", "failed", "stopping"],
  installing: ["running", "failed", "stopping"],
  starting: [],
  ready: [],
  reloading: [],
  running: ["finished", "errored", "stopping"],
  stopping: ["stopped"],
  stopped: [],
  finished: [],
  errored: [],
  crashed: [],
  failed: [],
};

export function allowedTransitions(kind: RunKind, from: RunState): readonly RunState[] {
  return (kind === "oneshot" ? oneshotTable : serverTable)[from];
}

export function canTransition(kind: RunKind, from: RunState, to: RunState): boolean {
  return allowedTransitions(kind, from).includes(to);
}

/** 引擎内部违反状态机。不是给用户看的错误，只进日志 */
export class IllegalTransitionError extends Error {
  readonly kind: RunKind;
  readonly from: RunState;
  readonly to: RunState;

  constructor(kind: RunKind, from: RunState, to: RunState) {
    super(`illegal run transition for ${kind}: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
    this.kind = kind;
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(kind: RunKind, from: RunState, to: RunState): void {
  if (!canTransition(kind, from, to)) throw new IllegalTransitionError(kind, from, to);
}
