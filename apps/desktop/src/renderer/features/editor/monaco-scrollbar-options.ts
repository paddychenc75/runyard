import { numbers } from "@runyard/tokens";
import type * as Monaco from "monaco-editor/editor/editor.api.js";

// 滚动条规范（视觉规范第 5 节）：感应区 14，滑块 10 画出来再按样式缩成平时的 6，
// 颜色走 scrollbarSlider.*（tokens 生成的 Monaco 主题），形状和淡入淡出见 editor/monaco-scrollbar.css
export const scrollbarOptions: Monaco.editor.IEditorScrollbarOptions = {
  useShadows: false,
  horizontalScrollbarSize: numbers["size-scrollbar-hit"],
  verticalScrollbarSize: numbers["size-scrollbar-hit"],
  horizontalSliderSize: numbers["size-scrollbar-thumb-hover"],
  verticalSliderSize: numbers["size-scrollbar-thumb-hover"],
};
