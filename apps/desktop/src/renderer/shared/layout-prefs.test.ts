// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { defaultLayoutPrefs, loadLayoutPrefs } from "./layout-prefs.ts";

afterEach(() => window.localStorage.clear());

describe("版面偏好", () => {
  it("没存过是默认值：侧栏展开，面板用默认尺寸", () => {
    expect(loadLayoutPrefs()).toEqual(defaultLayoutPrefs);
  });

  it("[DESKTOP-LIBRARY-VIEW-62] 存下来的收起状态和尺寸读得回来", () => {
    window.localStorage.setItem(
      "runyard.layout.v1",
      JSON.stringify({ sidebarCollapsed: true, treeWidth: 300, consoleHeight: 150 }),
    );
    expect(loadLayoutPrefs()).toMatchObject({
      sidebarCollapsed: true,
      treeWidth: 300,
      consoleHeight: 150,
      previewWidth: null,
    });
  });

  it("存的东西坏了（不是 JSON、尺寸不是正数）就当没存", () => {
    window.localStorage.setItem("runyard.layout.v1", "{坏");
    expect(loadLayoutPrefs()).toEqual(defaultLayoutPrefs);
    window.localStorage.setItem(
      "runyard.layout.v1",
      JSON.stringify({ treeWidth: -3, previewWidth: "宽", consoleHeight: null }),
    );
    expect(loadLayoutPrefs()).toEqual(defaultLayoutPrefs);
  });
});
