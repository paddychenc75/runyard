import { numbers } from "@runyard/tokens";

// 窗口的版面常量。侧栏、顶栏、列表是界面进程画的，右侧预览是主进程摆的原生视图，
// 尺寸只在这里写一次，界面把它们写成 CSS 变量（--layout-*）；预览视图的位置不在这里算，由占位区实测后报给主进程。
// 浮在窗口四周的留白和顶栏胶囊的高度来自设计变量，不在这里另写一份。

/** 悬浮侧栏的宽度（设计稿 Main：240） */
export const SIDEBAR_WIDTH_PX = 240;
/** 内容区左边到窗口左边：侧栏两侧各一份留白 */
export const CONTENT_LEFT_PX = numbers["size-window-inset"] * 2 + SIDEBAR_WIDTH_PX;
/** 顶栏占的高度：统一窗口标题栏 52（设计稿 Main） */
export const TOPBAR_HEIGHT_PX = numbers["size-titlebar"];
/**
 * 内容区左边的列表宽度（开发期的朴素列表、标签页的信息栏）。预览占位区紧挨在它右边，
 * 位置和大小由界面里的占位区量出来报给主进程（PreviewSlot），不在这里算。
 */
export const LIST_WIDTH_PX = 360;

/** 项目标签页左边文件树面板的宽度（设计稿 Web：216） */
export const FILE_TREE_WIDTH_PX = 216;

/** 标签页底部控制台的高度（设计稿 Service：约 220） */
export const CONSOLE_HEIGHT_PX = 220;

export interface Size {
  width: number;
  height: number;
}

export interface Bounds extends Size {
  x: number;
  y: number;
}

/** 界面要写进 <html> 的版面 CSS 变量，名字与值 */
export const layoutCssVariables: Readonly<Record<string, string>> = {
  "--layout-sidebar-width": `${SIDEBAR_WIDTH_PX}px`,
  "--layout-content-left": `${CONTENT_LEFT_PX}px`,
  "--layout-topbar-height": `${TOPBAR_HEIGHT_PX}px`,
  "--layout-list-width": `${LIST_WIDTH_PX}px`,
  "--layout-file-tree-width": `${FILE_TREE_WIDTH_PX}px`,
  "--layout-console-height": `${CONSOLE_HEIGHT_PX}px`,
};
