import type * as Monaco from "monaco-editor/editor/editor.api.js";

// 编辑器里“不是代码”的那部分设置：浮层、中文标点、链接（issue #442、#443）。
// 浮层的配色在 tokens 生成的主题里，形状在 editor/monaco-widgets.css。
export const widgetOptions: Monaco.editor.IEditorOptions = {
  // 浮层挂在 fixed 定位的宿主上，不被编辑器卡片的 overflow 裁掉
  fixedOverflowWidgets: true,
  // 全角标点（：，）和中文里常见的易混淆字符不当成问题；看不见的字符（零宽、BOM 之外的控制字符）仍然提示
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: true,
    nonBasicASCII: false,
    includeComments: false,
    includeStrings: true,
  },
  // 链接只在按住 ⌘ 悬停时才画下划线（颜色见 monaco-widgets.css），平时不画
  links: true,
  suggest: { showStatusBar: false, showIcons: true, preview: false },
  suggestLineHeight: 28,
  suggestFontSize: 13,
  hover: { above: false, delay: 300 },
  parameterHints: { enabled: true, cycle: true },
};
