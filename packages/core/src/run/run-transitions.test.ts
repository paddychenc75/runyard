import { type RunKind, type RunState, runStates } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import {
  activeStates,
  allowedTransitions,
  assertTransition,
  canTransition,
  endStates,
  IllegalTransitionError,
  isActiveState,
} from "./run-transitions.ts";

// 转移表和 docs/architecture/run-state-machine.md 第 1 节逐条对照；不在表里的一律非法。
const serverEdges: [RunState, RunState][] = [
  ["checking", "installing"],
  ["checking", "starting"],
  ["checking", "failed"],
  ["checking", "stopping"],
  ["installing", "starting"],
  ["installing", "failed"],
  ["installing", "stopping"],
  ["starting", "ready"],
  ["starting", "failed"],
  ["starting", "stopping"],
  ["ready", "reloading"],
  ["ready", "crashed"],
  ["ready", "stopping"],
  ["reloading", "ready"],
  ["reloading", "crashed"],
  ["reloading", "stopping"],
  ["stopping", "stopped"],
];
const oneshotEdges: [RunState, RunState][] = [
  ["checking", "installing"],
  ["checking", "running"],
  ["checking", "failed"],
  ["checking", "stopping"],
  ["installing", "running"],
  ["installing", "failed"],
  ["installing", "stopping"],
  ["running", "finished"],
  ["running", "errored"],
  ["running", "stopping"],
  ["stopping", "stopped"],
];

describe.each([
  ["server", serverEdges],
  ["static", serverEdges],
  ["oneshot", oneshotEdges],
] as [RunKind, [RunState, RunState][]][])("转移表：%s", (kind, edges) => {
  it("恰好允许文档里的转移，其余一律拒绝", () => {
    for (const from of runStates) {
      for (const to of runStates) {
        const expected = edges.some(([a, b]) => a === from && b === to);
        expect(canTransition(kind, from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("结束的状态没有出路", () => {
    for (const state of endStates) expect(allowedTransitions(kind, state)).toEqual([]);
  });
});

describe("活动状态", () => {
  it("七种计入“N 个运行中”，其余五种不计", () => {
    expect([...activeStates].sort()).toEqual(
      ["checking", "installing", "starting", "ready", "reloading", "running", "stopping"].sort(),
    );
    for (const state of ["stopped", "finished", "errored", "crashed", "failed"] as const) {
      expect(isActiveState(state)).toBe(false);
    }
    expect(activeStates.length + endStates.length).toBe(runStates.length);
  });
});

describe("非法转移", () => {
  it("抛出带来源、目标的 IllegalTransitionError", () => {
    expect(() => assertTransition("server", "starting", "running")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("oneshot", "running", "ready")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("server", "ready", "stopping")).not.toThrow();
  });
});
