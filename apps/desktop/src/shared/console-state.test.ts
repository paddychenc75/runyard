import { describe, expect, it } from "vitest";
import { type ConsoleLine, mergeConsoleLines } from "./console-state.ts";

const line = (seq: number): ConsoleLine => ({
  seq,
  entry: { at: seq, kind: "stdout", text: `l${seq}` },
});
const seqs = (lines: readonly ConsoleLine[]) => lines.map((item) => item.seq);

describe("mergeConsoleLines", () => {
  it("只接上 seq 更大的行：快照和推送重叠时不重复", () => {
    expect(seqs(mergeConsoleLines([line(1), line(2)], [line(2), line(3)], false))).toEqual([
      1, 2, 3,
    ]);
  });

  it("没有新行时内容不变", () => {
    expect(seqs(mergeConsoleLines([line(1)], [line(1)], false))).toEqual([1]);
  });

  it("reset 整体替换", () => {
    expect(seqs(mergeConsoleLines([line(1), line(2)], [line(5)], true))).toEqual([5]);
  });
});
