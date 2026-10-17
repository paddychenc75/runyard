import { describe, expect, it } from "vitest";
import { run } from "./library-fixtures.ts";
import { StartTimeline } from "./start-timeline.ts";

const latest = (...runs: ReturnType<typeof run>[]) =>
  new Map(runs.map((snapshot) => [snapshot.playgroundId, snapshot]));

describe("StartTimeline 启动清单各步用时", () => {
  it("[DESKTOP-CREATE-FLOW-14] 每步用时是相邻状态第一次被看到的时间差，复制用创建请求的耗时", () => {
    const timeline = new StartTimeline();
    timeline.noteCopy("a", 120);
    timeline.observe(latest(run("a", "checking")), 1_000);
    timeline.observe(latest(run("a", "installing")), 1_100);
    // 同一状态再被看到不改起点
    timeline.observe(latest(run("a", "installing")), 1_200);
    timeline.observe(latest(run("a", "starting")), 1_400);
    expect(timeline.phases("a")).toEqual({ copy: 120, install: 300, start: null });
    timeline.observe(latest(run("a", "ready")), 3_900);
    expect(timeline.phases("a")).toEqual({ copy: 120, install: 300, start: 2_500 });
  });

  it("[DESKTOP-CREATE-FLOW-14] 跳过的步骤（没有安装）没有用时；复制耗时只属于紧接着的那一次运行", () => {
    const timeline = new StartTimeline();
    timeline.noteCopy("a", 80);
    timeline.observe(latest(run("a", "checking", { runId: "r1" })), 0);
    timeline.observe(latest(run("a", "starting", { runId: "r1" })), 50);
    expect(timeline.phases("a")).toEqual({ copy: 80, install: null, start: null });
    timeline.observe(latest(run("a", "checking", { runId: "r2" })), 9_000);
    expect(timeline.phases("a")).toEqual({ copy: null, install: null, start: null });
  });

  it("没见过的项目没有用时，忘掉之后清空", () => {
    const timeline = new StartTimeline();
    expect(timeline.phases("x")).toEqual({ copy: null, install: null, start: null });
    timeline.observe(latest(run("x", "installing")), 1);
    timeline.forget("x");
    expect(timeline.phases("x")).toEqual({ copy: null, install: null, start: null });
  });
});
