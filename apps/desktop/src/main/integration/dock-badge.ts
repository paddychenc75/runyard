import type { App } from "electron";
import type { DockBadge } from "../controller-hosts.ts";

// Dock 图标角标（规格 DESKTOP-LIBRARY-VIEW-57）：写待清理的项目数，0 就清掉。
// 只有 macOS 有 Dock，别的系统 `app.dock` 不存在，什么都不做；不发系统通知。
export function createDockBadge(app: Pick<App, "dock">): DockBadge {
  return {
    set(count) {
      app.dock?.setBadge(count > 0 ? String(count) : "");
    },
  };
}

/** 自动清理的检查间隔：提醒的单位是天，十分钟一轮足够，也让角标和提示条在窗口开着时跟上时间 */
export const CLEAN_CHECK_INTERVAL_MS = 10 * 60 * 1000;
