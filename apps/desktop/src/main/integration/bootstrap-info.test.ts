import { describe, expect, it } from "vitest";
import { buildBootstrapInfo } from "./bootstrap-info.ts";

const inputs = {
  locale: "zh-CN",
  theme: "dark",
  reducedTransparency: true,
  highContrast: false,
} as const;

describe("buildBootstrapInfo", () => {
  it("macOS：按钮在左，快捷键用 ⌘，语言与无障碍开关原样带上", () => {
    expect(buildBootstrapInfo("darwin", inputs)).toEqual({
      platform: "darwin",
      windowControls: { side: "left", inset: 72 },
      modKey: "meta",
      locale: "zh-CN",
      theme: "dark",
      reducedTransparency: true,
      highContrast: false,
    });
  });

  it("主题选择原样带给界面，system 就是 system", () => {
    expect(buildBootstrapInfo("darwin", { ...inputs, theme: "system" }).theme).toBe("system");
    expect(buildBootstrapInfo("darwin", { ...inputs, theme: "light" }).theme).toBe("light");
  });

  it("其他系统：按钮在右，快捷键用 Ctrl", () => {
    const info = buildBootstrapInfo("linux", inputs);
    expect(info.windowControls.side).toBe("right");
    expect(info.modKey).toBe("ctrl");
  });
});
