// 由 pnpm tokens:build 生成，不要手改。要改就改 packages/tokens/src/tokens.json（技术设计 §6.7）。

/** Monaco：monaco.editor.defineTheme(名字, monacoThemes.light)，base 和 inherit 已写好 */
export const monacoThemes = {
  light: {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "AD3DA4" },
      { token: "string", foreground: "B3261E" },
      { token: "number", foreground: "1C00CF" },
      { token: "comment", foreground: "6E6E73" },
      { token: "delimiter", foreground: "6E6E73" },
      { token: "tag", foreground: "1B7A34" },
      { token: "attribute.name", foreground: "0F68A0" },
      { token: "type", foreground: "0F68A0" },
      { token: "predefined", foreground: "0F68A0" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1D1D1F",
      "editorLineNumber.foreground": "#6E6E73",
      "editorLineNumber.activeForeground": "#1D1D1F",
      "editor.lineHighlightBackground": "#0071E312",
      "editor.selectionBackground": "#0071E314",
      "editorCursor.foreground": "#0071E3",
    },
  },
  dark: {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "FF7AB2" },
      { token: "string", foreground: "FF8170" },
      { token: "number", foreground: "D9C97C" },
      { token: "comment", foreground: "A1A1A6" },
      { token: "delimiter", foreground: "A1A1A6" },
      { token: "tag", foreground: "4EB0CC" },
      { token: "attribute.name", foreground: "6BDFFF" },
      { token: "type", foreground: "6BDFFF" },
      { token: "predefined", foreground: "6BDFFF" },
    ],
    colors: {
      "editor.background": "#1E1E21",
      "editor.foreground": "#F5F5F7",
      "editorLineNumber.foreground": "#8E8E93",
      "editorLineNumber.activeForeground": "#F5F5F7",
      "editor.lineHighlightBackground": "#FFFFFF0F",
      "editor.selectionBackground": "#0A84FF52",
      "editorCursor.foreground": "#0A84FF",
    },
  },
} as const;

/** Shiki：交给 createHighlighter 的 themes */
export const shikiThemes = {
  light: {
    name: "runyard-light",
    type: "light",
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1D1D1F",
      "editorLineNumber.foreground": "#6E6E73",
      "editorLineNumber.activeForeground": "#1D1D1F",
      "editor.lineHighlightBackground": "#0071E312",
      "editor.selectionBackground": "#0071E314",
      "editorCursor.foreground": "#0071E3",
    },
    tokenColors: [
      {
        scope: ["keyword", "storage"],
        settings: { foreground: "#AD3DA4" },
      },
      {
        scope: ["string"],
        settings: { foreground: "#B3261E" },
      },
      {
        scope: ["entity.name.function", "support.function", "variable.other.property"],
        settings: { foreground: "#0F68A0" },
      },
      {
        scope: ["constant.numeric"],
        settings: { foreground: "#1C00CF" },
      },
      {
        scope: ["entity.name.tag"],
        settings: { foreground: "#1B7A34" },
      },
      {
        scope: ["punctuation", "comment"],
        settings: { foreground: "#6E6E73" },
      },
    ],
  },
  dark: {
    name: "runyard-dark",
    type: "dark",
    colors: {
      "editor.background": "#1E1E21",
      "editor.foreground": "#F5F5F7",
      "editorLineNumber.foreground": "#8E8E93",
      "editorLineNumber.activeForeground": "#F5F5F7",
      "editor.lineHighlightBackground": "#FFFFFF0F",
      "editor.selectionBackground": "#0A84FF52",
      "editorCursor.foreground": "#0A84FF",
    },
    tokenColors: [
      {
        scope: ["keyword", "storage"],
        settings: { foreground: "#FF7AB2" },
      },
      {
        scope: ["string"],
        settings: { foreground: "#FF8170" },
      },
      {
        scope: ["entity.name.function", "support.function", "variable.other.property"],
        settings: { foreground: "#6BDFFF" },
      },
      {
        scope: ["constant.numeric"],
        settings: { foreground: "#D9C97C" },
      },
      {
        scope: ["entity.name.tag"],
        settings: { foreground: "#4EB0CC" },
      },
      {
        scope: ["punctuation", "comment"],
        settings: { foreground: "#A1A1A6" },
      },
    ],
  },
} as const;

/** xterm：赋给 terminal.options.theme */
export const xtermThemes = {
  light: {
    background: "#FFFFFF",
    foreground: "#1D1D1F",
    cursor: "#0071E3",
    selectionBackground: "#0071E314",
    black: "#3A3A3C",
    red: "#D70015",
    green: "#28A745",
    yellow: "#C27400",
    blue: "#0071E3",
    magenta: "#AD3DA4",
    cyan: "#0F68A0",
    white: "#8E8E93",
    brightBlack: "#6E6E73",
    brightRed: "#C4001A",
    brightGreen: "#1B7A34",
    brightYellow: "#8A4B00",
    brightBlue: "#0058B0",
    brightMagenta: "#7A2E9E",
    brightCyan: "#1B7A34",
    brightWhite: "#1D1D1F",
  },
  dark: {
    background: "#1E1E21",
    foreground: "#F5F5F7",
    cursor: "#0A84FF",
    selectionBackground: "#0A84FF52",
    black: "#D1D1D6",
    red: "#FF453A",
    green: "#30D158",
    yellow: "#FFD60A",
    blue: "#0A84FF",
    magenta: "#FF7AB2",
    cyan: "#6BDFFF",
    white: "#8E8E93",
    brightBlack: "#A1A1A6",
    brightRed: "#FF9F99",
    brightGreen: "#30D158",
    brightYellow: "#FFD60A",
    brightBlue: "#4DA3FF",
    brightMagenta: "#D0A8FF",
    brightCyan: "#4EB0CC",
    brightWhite: "#F5F5F7",
  },
} as const;
