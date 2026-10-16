// 窗口的版面常量。左侧列表是界面进程画的，右侧预览是主进程摆的原生视图，
// 两边必须对得上，所以宽度只在这里写一次：主进程用它算预览视图的位置，界面把它写成 CSS 变量。
export const LIST_WIDTH_PX = 360;

export interface Size {
  width: number;
  height: number;
}

export interface Bounds extends Size {
  x: number;
  y: number;
}

/** 预览视图在窗口内容区里的位置：列表右边的整块 */
export function previewBounds(content: Size): Bounds {
  return {
    x: LIST_WIDTH_PX,
    y: 0,
    width: Math.max(0, content.width - LIST_WIDTH_PX),
    height: content.height,
  };
}
