import type { Locale } from "@runyard/i18n";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";

// 启动信息里随系统变的部分：平台、窗口按钮位置、快捷键用 ⌘ 还是 Ctrl。
// 系统分支只许写在 integration 目录（技术设计 §3.2 规则 4）。第一版只有 macOS 一支，其余系统先按相同的默认值。

export interface BootstrapInputs {
  locale: Locale;
  /** 系统当前是否深色；窗口主题跟随系统 */
  systemDark: boolean;
  reducedTransparency: boolean;
  highContrast: boolean;
}

export function currentPlatform(): BootstrapInfo["platform"] {
  if (process.platform === "darwin" || process.platform === "win32") return process.platform;
  return "linux";
}

export function buildBootstrapInfo(
  platform: BootstrapInfo["platform"],
  inputs: BootstrapInputs,
): BootstrapInfo {
  const mac = platform === "darwin";
  return {
    platform,
    // 现在用系统自带的标题栏，所以顶栏不用为窗口按钮让位；做自绘标题栏时在这里改
    windowControls: { side: mac ? "left" : "right", inset: 0 },
    modKey: mac ? "meta" : "ctrl",
    locale: inputs.locale,
    theme: "system",
    reducedTransparency: inputs.reducedTransparency,
    highContrast: inputs.highContrast,
  };
}
