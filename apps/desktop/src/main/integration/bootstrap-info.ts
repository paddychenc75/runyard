import type { Locale } from "@runyard/i18n";
import { numbers } from "@runyard/tokens";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";

// 启动信息里随系统变的部分：平台、窗口按钮位置、快捷键用 ⌘ 还是 Ctrl。
// 系统分支只许写在 integration 目录（技术设计 §3.2 规则 4）。第一版只有 macOS 一支，其余系统先按相同的默认值。

export interface BootstrapInputs {
  locale: Locale;
  /** 窗口的明暗选择；预加载脚本据此在页面脚本运行前写 <html data-theme>（system 时不写色，由 CSS 跟随系统） */
  theme: BootstrapInfo["theme"];
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
    // 标题栏是自绘的（macOS 用 hiddenInset，红黄绿画在侧栏顶上）：这一侧要给窗口按钮让出 inset，
    // 与设计变量 size-window-controls 同值，TitleBar 用后者留空
    windowControls: {
      side: mac ? "left" : "right",
      inset: mac ? numbers["size-window-controls"] : 0,
    },
    modKey: mac ? "meta" : "ctrl",
    locale: inputs.locale,
    theme: inputs.theme,
    reducedTransparency: inputs.reducedTransparency,
    highContrast: inputs.highContrast,
  };
}

/** 关掉窗口后应用是否继续运行：macOS 的惯例，规格 desktop/workspace 要求如此 */
export function closeKeepsAppAlive(platform: BootstrapInfo["platform"]): boolean {
  return platform === "darwin";
}
