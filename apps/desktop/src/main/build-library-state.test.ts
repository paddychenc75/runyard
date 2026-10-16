import { describe, expect, it } from "vitest";
import { buildLibraryState, isActiveRun, previewUrlFor } from "./build-library-state.ts";
import { playground, run, template } from "./library-fixtures.ts";

const base = {
  locale: "zh-CN" as const,
  templates: [],
  previewId: null,
  busyIds: new Set<string>(),
  error: null,
};

describe("buildLibraryState", () => {
  it("没有运行过的项目显示 idle，且不算进行中", () => {
    const state = buildLibraryState({ ...base, playgrounds: [playground("a")], runs: [] });
    expect(state.playgrounds[0]).toMatchObject({ id: "a", state: "idle", active: false });
  });

  it("每个项目取最近一次运行的状态", () => {
    const state = buildLibraryState({
      ...base,
      playgrounds: [playground("a")],
      runs: [run("a", "stopped", { startedAt: 1 }), run("a", "ready", { startedAt: 9 })],
    });
    expect(state.playgrounds[0]).toMatchObject({ state: "ready", active: true });
  });

  it("已结束的状态不算进行中，其余都算", () => {
    for (const ended of ["stopped", "finished", "errored", "crashed", "failed"] as const) {
      expect(isActiveRun(ended)).toBe(false);
    }
    for (const live of [
      "checking",
      "installing",
      "starting",
      "ready",
      "running",
      "stopping",
    ] as const) {
      expect(isActiveRun(live)).toBe(true);
    }
  });

  it("只列内置的、格式有效的、运行器可用的模板", () => {
    const state = buildLibraryState({
      ...base,
      playgrounds: [],
      runs: [],
      templates: [
        template("html"),
        template("mine", { source: "user" }),
        template("broken", { valid: false }),
        template("norunner", { kind: null }),
      ],
    });
    expect(state.templates.map((row) => row.id)).toEqual(["html"]);
  });

  it("标出预览中的项目和正在等待的项目", () => {
    const state = buildLibraryState({
      ...base,
      playgrounds: [playground("a"), playground("b")],
      runs: [],
      previewId: "b",
      busyIds: new Set(["a"]),
    });
    expect(state.playgrounds.map((row) => [row.previewing, row.busy])).toEqual([
      [false, true],
      [true, false],
    ]);
  });
});

describe("previewUrlFor", () => {
  const ready = run("a", "ready", { url: "http://127.0.0.1:7101" });

  it("就绪且有地址时给出地址", () => {
    expect(previewUrlFor("a", [ready])).toBe("http://127.0.0.1:7101");
  });

  it("没选项目、还没就绪、已停止时都没有地址", () => {
    expect(previewUrlFor(null, [ready])).toBeNull();
    expect(previewUrlFor("a", [run("a", "starting")])).toBeNull();
    expect(previewUrlFor("a", [run("a", "stopped", { url: "http://127.0.0.1:7101" })])).toBeNull();
    expect(previewUrlFor("b", [ready])).toBeNull();
  });
});
