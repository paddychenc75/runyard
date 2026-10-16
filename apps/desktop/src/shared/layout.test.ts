import { describe, expect, it } from "vitest";
import {
  CONTENT_LEFT_PX,
  LIST_WIDTH_PX,
  layoutCssVariables,
  previewBounds,
  TOPBAR_HEIGHT_PX,
} from "./layout.ts";

describe("previewBounds", () => {
  it("预览占顶栏下面、侧栏和列表右边的整块，窗口窄到放不下时宽高为 0", () => {
    expect(previewBounds({ width: 1200, height: 700 })).toEqual({
      x: CONTENT_LEFT_PX + LIST_WIDTH_PX,
      y: TOPBAR_HEIGHT_PX,
      width: 1200 - CONTENT_LEFT_PX - LIST_WIDTH_PX,
      height: 700 - TOPBAR_HEIGHT_PX,
    });
    expect(previewBounds({ width: 100, height: 20 })).toMatchObject({ width: 0, height: 0 });
  });

  it("尺寸与设计稿 Main 一致：内容区从 256 开始，顶栏高 68", () => {
    expect(CONTENT_LEFT_PX).toBe(256);
    expect(TOPBAR_HEIGHT_PX).toBe(68);
  });
});

describe("layoutCssVariables", () => {
  it("界面据以写 CSS 的变量和主进程摆预览用的是同一份数字", () => {
    expect(layoutCssVariables["--layout-content-left"]).toBe(`${CONTENT_LEFT_PX}px`);
    expect(layoutCssVariables["--layout-topbar-height"]).toBe(`${TOPBAR_HEIGHT_PX}px`);
    expect(layoutCssVariables["--layout-list-width"]).toBe(`${LIST_WIDTH_PX}px`);
  });
});
