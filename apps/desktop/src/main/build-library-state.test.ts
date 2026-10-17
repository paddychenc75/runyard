import { describe, expect, it } from "vitest";
import { buildLibraryState, isActiveRun, previewUrlFor } from "./build-library-state.ts";
import { playground, run, template } from "./library-fixtures.ts";

const base = {
  locale: "zh-CN" as const,
  templates: [],
  tabIds: [] as string[],
  activeTab: "library",
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
      activeTab: "b",
      busyIds: new Set(["a"]),
    });
    expect(state.playgrounds.map((row) => [row.previewing, row.busy])).toEqual([
      [false, true],
      [true, false],
    ]);
  });
});

describe("标签页", () => {
  it("只列打开的项目，按打开顺序，状态归并成小圆点", () => {
    const state = buildLibraryState({
      ...base,
      playgrounds: [playground("a"), playground("b"), playground("c")],
      runs: [run("a", "ready"), run("b", "installing"), run("c", "crashed")],
      tabIds: ["c", "a"],
      activeTab: "a",
    });
    expect(state.tabs.map((tab) => [tab.id, tab.status])).toEqual([
      ["c", "crashed"],
      ["a", "running"],
    ]);
    expect(state.activeTab).toBe("a");
  });

  it("手动停止和从没运行过都是空心圆点", () => {
    const state = buildLibraryState({
      ...base,
      playgrounds: [playground("a"), playground("b")],
      runs: [run("a", "stopped")],
      tabIds: ["a", "b"],
    });
    expect(state.tabs.map((tab) => tab.status)).toEqual(["stopped", "stopped"]);
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

describe("buildLibraryState 的列和顺序", () => {
  const at = (id: string, lastOpenedAt: number | undefined) => ({
    ...playground(id),
    ...(lastOpenedAt === undefined ? {} : { lastOpenedAt }),
  });

  it("[DESKTOP-LIBRARY-VIEW-01] 运行中的排在最前，其余按上次打开从新到旧", () => {
    const state = buildLibraryState({
      ...base,
      // 三个项目里只有“上次打开最早”的那个在运行
      playgrounds: [at("recent", 300), at("running", 100), at("older", 200)],
      runs: [run("running", "ready")],
    });
    expect(state.playgrounds.map((row) => row.id)).toEqual(["running", "recent", "older"]);
  });

  it("从没打开过的项目按创建时间排，时间相同按名字", () => {
    const created = (id: string, createdAt: number) => ({ ...playground(id), createdAt });
    const state = buildLibraryState({
      ...base,
      playgrounds: [created("b", 5), created("a", 5), created("c", 9)],
      runs: [],
    });
    expect(state.playgrounds.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-02] 备注和端口：进行中的运行用实际端口，其次是登记的端口，脚本没有端口", () => {
    const withPort = { ...playground("svc"), note: "pricing table layout test", port: 7101 };
    const script = { ...playground("script"), kind: "oneshot" as const };
    const state = buildLibraryState({
      ...base,
      playgrounds: [withPort, script],
      runs: [run("svc", "ready", { port: 7105 })],
    });
    const byId = new Map(state.playgrounds.map((row) => [row.id, row]));
    expect(byId.get("svc")).toMatchObject({ note: "pricing table layout test", port: 7105 });
    expect(byId.get("script")).toMatchObject({ note: "", port: null });
    const stopped = buildLibraryState({ ...base, playgrounds: [withPort], runs: [] });
    expect(stopped.playgrounds[0]?.port).toBe(7101);
  });

  it("[DESKTOP-LIBRARY-VIEW-03] 保留的信息：关闭自动清理就是已保留，开启的带天数", () => {
    const temp = { ...playground("temp"), autoClean: { enabled: true, days: 30 } };
    const state = buildLibraryState({ ...base, playgrounds: [playground("kept"), temp], runs: [] });
    const byId = new Map(state.playgrounds.map((row) => [row.id, row]));
    expect(byId.get("kept")?.autoClean).toEqual({ enabled: false, days: null });
    expect(byId.get("temp")?.autoClean).toEqual({ enabled: true, days: 30 });
  });

  it("模板名从模板列表按 id 取，模板不在了就是 null", () => {
    const state = buildLibraryState({
      ...base,
      templates: [template("html")],
      playgrounds: [playground("a")],
      runs: [],
    });
    expect(state.playgrounds[0]?.templateName).toEqual({ en: "html", "zh-CN": "html-zh" });
    const missing = buildLibraryState({ ...base, playgrounds: [playground("a")], runs: [] });
    expect(missing.playgrounds[0]?.templateName).toBeNull();
  });
});

describe("recentTemplateIds", () => {
  it("[DESKTOP-CREATE-FLOW-04] 按创建时间从新到旧取用过的模板，同一个只算一次，不在列表里的略过", () => {
    const made = (id: string, templateId: string, createdAt: number) => ({
      ...playground(id),
      template: { id: templateId, source: "builtin" as const, appVersion: "0" },
      createdAt,
    });
    const state = buildLibraryState({
      ...base,
      templates: [template("html"), template("vue3"), template("react19")],
      playgrounds: [
        made("a", "html", 1),
        made("b", "vue3", 9),
        made("c", "html", 5),
        made("d", "gone", 20),
      ],
      runs: [],
    });
    expect(state.recentTemplates).toEqual(["vue3", "html"]);
  });
});

describe("运行条与脚本页的数据", () => {
  const withTab = (runs: ReturnType<typeof run>[], extra = {}) =>
    buildLibraryState({
      ...base,
      tabIds: ["a"],
      playgrounds: [{ ...playground("a"), kind: "oneshot", ...extra }],
      runs,
    }).tabs[0];

  it("[DESKTOP-WORKSPACE-35] 语法错误：快照带 stale 时标签页也标过期，新的运行没有", () => {
    expect(withTab([run("a", "finished", { stale: true })])?.stale).toBe(true);
    expect(withTab([run("a", "finished")])?.stale).toBe(false);
  });

  it("[DESKTOP-WORKSPACE-34] 项目自己的自动运行开关：没写过是开，关掉后是关", () => {
    expect(withTab([])?.scriptAutoRun).toBe(true);
    expect(withTab([], { scriptAutoRun: false })?.scriptAutoRun).toBe(false);
  });

  it("[DESKTOP-WORKSPACE-41] 脚本没能启动：带上失败原因；跑出错（errored）不算启动失败", () => {
    expect(withTab([run("a", "failed", { reason: "RUN_FAILED" })])?.failure).toEqual({
      code: "RUN_FAILED",
      params: { name: "a" },
    });
    expect(withTab([run("a", "errored")])?.failure).toBeNull();
  });
});
