import { describe, expect, it } from "vitest";
import { fitTabs } from "./fit-tabs.ts";

const base = {
  widths: [100, 120, 120, 120, 120],
  selected: 0,
  shrinkable: [true, false, false, false, false],
  iconWidth: 36,
  moreWidth: 50,
};

describe("fitTabs", () => {
  it("[DESKTOP-WORKSPACE-63] 放得下就全部完整显示", () => {
    const result = fitTabs({ ...base, available: 600 });
    expect(result.visible).toEqual([true, true, true, true, true]);
    expect(result.iconOnly).toEqual([false, false, false, false, false]);
  });

  it("[DESKTOP-WORKSPACE-63] 没量到宽度（0）时全部显示，不把标签折进菜单", () => {
    expect(fitTabs({ ...base, available: 0 }).visible).toEqual([true, true, true, true, true]);
  });

  it("[DESKTOP-WORKSPACE-63] 先把资源库标签缩成图标，缩了就够的话不折叠任何标签", () => {
    const result = fitTabs({ ...base, available: 36 + 480 });
    expect(result.iconOnly[0]).toBe(true);
    expect(result.visible).toEqual([true, true, true, true, true]);
  });

  it("[DESKTOP-WORKSPACE-63] 还不够就把后面的标签折进“+N”，顺序不乱", () => {
    const result = fitTabs({ ...base, available: 36 + 240 + 50 });
    expect(result.visible).toEqual([true, true, true, false, false]);
  });

  it("[DESKTOP-WORKSPACE-64] 选中的标签放在后面也始终显示", () => {
    const result = fitTabs({ ...base, selected: 4, available: 36 + 240 + 50 });
    expect(result.visible[4]).toBe(true);
    expect(result.visible.filter(Boolean)).toHaveLength(3);
    expect(result.visible.slice(0, 2)).toEqual([true, true]);
  });
});
