import { numbers } from "@runyard/tokens";

// 窗口的版面常量。侧栏、顶栏、列表是界面进程画的，右侧预览是主进程摆的原生视图，
// 两边必须对得上，所以尺寸只在这里写一次：主进程用它算预览视图的位置，界面把它写成 CSS 变量（--layout-*）。
// 浮在窗口四周的留白和顶栏胶囊的高度来自设计变量，不在这里另写一份。

/** 悬浮侧栏的宽度（设计稿 Main：240） */
export const SIDEBAR_WIDTH_PX = 240;
/** 内容区左边到窗口左边：侧栏两侧各一份留白 */
export const CONTENT_LEFT_PX = numbers["size-window-inset"] * 2 + SIDEBAR_WIDTH_PX;
/** 顶栏占的高度：胶囊上方留 14、胶囊自己 44、下方留 10（设计稿 Main） */
export const TOPBAR_HEIGHT_PX = 14 + numbers["size-toolbar"] + 10;
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
};

/** 预览视图在窗口内容区里的位置：顶栏下面的整块，盖住资源库页（开发期；标签页内容随 #170） */
export function previewBounds(content: Size): Bounds {
  const x = CONTENT_LEFT_PX;
  return {
    x,
    y: TOPBAR_HEIGHT_PX,
    width: Math.max(0, content.width - x),
    height: Math.max(0, content.height - TOPBAR_HEIGHT_PX),
  };
}
