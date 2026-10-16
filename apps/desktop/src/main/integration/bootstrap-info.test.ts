import { describe, expect, it } from "vitest";
import { buildBootstrapInfo } from "./bootstrap-info.ts";

const inputs = {
  locale: "zh-CN",
  systemDark: false,
  reducedTransparency: true,
  highContrast: false,
} as const;

describe("buildBootstrapInfo", () => {
  it("macOS：按钮在左，快捷键用 ⌘，语言与无障碍开关原样带上", () => {
    expect(buildBootstrapInfo("darwin", inputs)).toEqual({
      platform: "darwin",
      windowControls: { side: "left", inset: 0 },
      modKey: "meta",
      locale: "zh-CN",
      theme: "system",
      reducedTransparency: true,
      highContrast: false,
    });
  });

  it("其他系统：按钮在右，快捷键用 Ctrl", () => {
    const info = buildBootstrapInfo("linux", inputs);
    expect(info.windowControls.side).toBe("right");
    expect(info.modKey).toBe("ctrl");
  });
});
