import { themes, xtermThemes } from "@runyard/tokens";
import { describe, expect, it } from "vitest";
import { blend, findDecorations, terminalTheme } from "./terminal-theme.ts";

describe("终端配色", () => {
  it("[DESKTOP-TERMINAL-12] 浅色和深色各一套，背景、16 色来自设计变量，换主题只是换表", () => {
    const light = terminalTheme("light");
    const dark = terminalTheme("dark");
    expect(light.background).toBe(xtermThemes.light.background);
    expect(dark.background).toBe(xtermThemes.dark.background);
    expect(light.red).toBe(xtermThemes.light.red);
    expect(dark.red).toBe(xtermThemes.dark.red);
    expect(light.red).not.toBe(dark.red);
    for (const name of ["black", "brightWhite", "cyan", "brightMagenta"] as const) {
      expect(light[name]).toBe(xtermThemes.light[name]);
      expect(dark[name]).toBe(xtermThemes.dark[name]);
    }
  });

  it("[DESKTOP-TERMINAL-13] 正文是“次要强调”灰、光标是正文色，滚动条滑块用统一滚动条的颜色", () => {
    for (const mode of ["light", "dark"] as const) {
      const theme = terminalTheme(mode);
      expect(theme.foreground).toBe(themes[mode]["color-text-secondary-strong"]);
      expect(theme.cursor).toBe(themes[mode]["color-text-primary"]);
      expect(theme.scrollbarSliderBackground).toBe(themes[mode]["color-scrollbar-thumb"]);
      expect(theme.scrollbarSliderHoverBackground).toBe(
        themes[mode]["color-scrollbar-thumb-hover"],
      );
    }
  });

  it("查找高亮是不带透明度的色值（xterm 不收透明色），当前结果比别的深", () => {
    expect(blend("#000000", "#ffffff", 0.5)).toBe("#808080");
    for (const mode of ["light", "dark"] as const) {
      const decorations = findDecorations(mode);
      expect(decorations.matchBackground).toMatch(/^#[0-9a-f]{6}$/);
      expect(decorations.activeMatchBackground).toMatch(/^#[0-9a-f]{6}$/);
      expect(decorations.activeMatchBackground).not.toBe(decorations.matchBackground);
    }
  });
});
