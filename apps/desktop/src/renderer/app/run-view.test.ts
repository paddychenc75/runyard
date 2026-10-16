import { describe, expect, it } from "vitest";
import { runActionOf, runStatusOf, secondsOf } from "./run-view.ts";
import { sampleTab } from "./sample-tab.ts";

const script = (extra: Parameters<typeof sampleTab>[0]) =>
  sampleTab({ kind: "oneshot", port: null, ...extra });

describe("runStatusOf", () => {
  it("服务就绪：状态加端口", () => {
    expect(runStatusOf(sampleTab(), 5_000).text).toEqual({
      kind: "port",
      state: "ready",
      port: 7101,
    });
  });

  it("脚本运行中：从开始时间算出已运行的时长", () => {
    const tab = script({ state: "running", startedAt: 1_000 });
    expect(runStatusOf(tab, 4_200).text).toEqual({
      kind: "script-running",
      state: "running",
      elapsedMs: 3_200,
    });
  });

  it("[DESKTOP-WORKSPACE-15] 脚本跑完：已结束，带退出码和耗时", () => {
    const tab = script({
      state: "finished",
      active: false,
      exitCode: 0,
      durationMs: 180,
      status: "stopped",
    });
    const status = runStatusOf(tab, 9_999);
    expect(status.text).toEqual({
      kind: "script-ended",
      state: "finished",
      exitCode: 0,
      durationMs: 180,
    });
    expect(status.danger).toBe(false);
  });

  it("脚本出错：警示色，退出码保留", () => {
    const tab = script({
      state: "errored",
      active: false,
      exitCode: 1,
      durationMs: 400,
      status: "crashed",
    });
    const status = runStatusOf(tab, 1);
    expect(status.danger).toBe(true);
    expect(status.text).toMatchObject({ kind: "script-ended", exitCode: 1 });
  });

  it("手动停止的脚本只显示状态，不显示退出码", () => {
    const tab = script({
      state: "stopped",
      active: false,
      exitCode: 0,
      durationMs: 800,
      status: "stopped",
    });
    expect(runStatusOf(tab, 1).text).toEqual({ kind: "plain", state: "stopped" });
  });

  it("从没运行过", () => {
    expect(runStatusOf(sampleTab({ state: "idle", active: false, port: null }), 1).text).toEqual({
      kind: "plain",
      state: "idle",
    });
  });
});

describe("runActionOf", () => {
  it("运行中是停止，停止后是运行，失败后是重新运行", () => {
    expect(runActionOf(sampleTab())).toBe("stop");
    expect(runActionOf(sampleTab({ active: false, state: "stopped" }))).toBe("run");
    expect(runActionOf(sampleTab({ active: false, state: "idle" }))).toBe("run");
    expect(runActionOf(sampleTab({ active: false, state: "finished" }))).toBe("run");
    expect(runActionOf(sampleTab({ active: false, state: "errored" }))).toBe("rerun");
    expect(runActionOf(sampleTab({ active: false, state: "crashed" }))).toBe("rerun");
  });
});

describe("secondsOf", () => {
  it("不到 10 秒两位小数，再往上一位", () => {
    expect(secondsOf(180)).toBe(0.18);
    expect(secondsOf(3_200)).toBe(3.2);
    expect(secondsOf(42_540)).toBe(42.5);
  });
});
