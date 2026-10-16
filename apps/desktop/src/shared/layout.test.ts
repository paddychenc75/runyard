import { describe, expect, it } from "vitest";
import { CONTENT_LEFT_PX, LIST_WIDTH_PX, layoutCssVariables, TOPBAR_HEIGHT_PX } from "./layout.ts";

describe("外壳尺寸", () => {
  it("尺寸与设计稿 Main 一致：内容区从 256 开始，顶栏高 68", () => {
    expect(CONTENT_LEFT_PX).toBe(256);
    expect(TOPBAR_HEIGHT_PX).toBe(68);
  });
});

describe("layoutCssVariables", () => {
  it("界面据以写 CSS 的变量和 CSS 里用的是同一份数字", () => {
    expect(layoutCssVariables["--layout-content-left"]).toBe(`${CONTENT_LEFT_PX}px`);
    expect(layoutCssVariables["--layout-topbar-height"]).toBe(`${TOPBAR_HEIGHT_PX}px`);
    expect(layoutCssVariables["--layout-list-width"]).toBe(`${LIST_WIDTH_PX}px`);
  });
});
