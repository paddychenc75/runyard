import type { RunSnapshot, RunState } from "@runyard/protocol";
import { endStates } from "./run-transitions.ts";

// `Run.waitFor` 的等待者：到达指定状态，或者运行已经结束（不会再变）时兑现。

type Waiter = { states: readonly RunState[]; resolve: (snapshot: RunSnapshot) => void };

export class StateWaiters {
  #waiters: Waiter[] = [];

  wait(states: readonly RunState[]): Promise<RunSnapshot> {
    return new Promise((resolve) => this.#waiters.push({ states, resolve }));
  }

  notify(state: RunState, snapshot: RunSnapshot): void {
    const ready = this.#waiters.filter(
      (waiter) => waiter.states.includes(state) || endStates.includes(state),
    );
    this.#waiters = this.#waiters.filter((waiter) => !ready.includes(waiter));
    for (const waiter of ready) waiter.resolve(snapshot);
  }
}
