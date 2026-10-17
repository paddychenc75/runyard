import { copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 应用图标：docs/design/logo/final/ 是唯一的图标来源（技术设计 §3.1、§8.2）。
// 用 Dock 安全版（图形不超出圆角方块）的 1024 像素母版，electron-builder 自己转成 .icns。
// 生成物 build/icon.png 提交进仓库，icon.test.ts 核对它与来源没有脱节。

export const ICON_SOURCE = ["docs", "design", "logo", "final", "png", "icon-dock-1024.png"];
export const ICON_TARGET = ["apps", "desktop", "build", "icon.png"];

export function syncIcon(repoRoot: string): void {
  copyFileSync(join(repoRoot, ...ICON_SOURCE), join(repoRoot, ...ICON_TARGET));
}

export function iconIsFresh(repoRoot: string): boolean {
  return readFileSync(join(repoRoot, ...ICON_SOURCE)).equals(
    readFileSync(join(repoRoot, ...ICON_TARGET)),
  );
}
