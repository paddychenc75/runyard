import { describe, expect, it } from "vitest";
import { constants, numbers, themes, windowBackground, xtermThemes } from "./index.ts";

describe("@runyard/tokens 对外的值", () => {
  it("浅色和深色的变量名一一对应", () => {
    expect(Object.keys(themes.dark)).toEqual(Object.keys(themes.light));
  });

  it("窗口底色是设计稿里的两个值，主进程可以直接设给 backgroundColor", () => {
    expect(windowBackground.light.library).toBe("#FFFFFF");
    expect(windowBackground.dark.library).toBe("#1C1C1E");
    expect(windowBackground.light.workspace).toBe("#F5F5F7");
    expect(windowBackground.dark.workspace).toBe("#161618");
  });

  it("尺寸有数字形式（截图测试用）和带单位的字符串形式，两者一致", () => {
    expect(numbers["size-control-md"]).toBe(32);
    expect(constants["size-control-md"]).toBe("32px");
    expect(numbers["size-dialog-width"]).toBe(580);
  });

  it("终端配色取自同一份变量", () => {
    expect(xtermThemes.dark.background).toBe("#1E1E21");
    expect(xtermThemes.light.red).toBe("#D70015");
  });
});
