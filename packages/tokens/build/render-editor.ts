import { toHex } from "./color.ts";
import type { TokensSource } from "./model.ts";
import { quote } from "./quote.ts";
import { resolveThemes, type Theme, themeNames } from "./resolved.ts";

// 生成 editor-themes.ts：Monaco、Shiki、xterm 不认 CSS 变量，要真实色值（技术设计 §6.7）。
// 颜色全部从 tokens.json 的语义级变量取，这里只决定“哪个角色用哪个变量”和各库的字段名。

const HEADER =
  "// 由 pnpm tokens:build 生成，不要手改。要改就改 packages/tokens/src/tokens.json（技术设计 §6.7）。";

type Pick = (name: string) => string;

// Monaco 的词法名（monarch 的 token 名）到变量
const monacoRoles: [string, string][] = [
  ["keyword", "color-code-keyword"],
  ["string", "color-code-string"],
  ["number", "color-code-number"],
  ["comment", "color-code-punctuation"],
  ["delimiter", "color-code-punctuation"],
  ["tag", "color-code-tag"],
  ["attribute.name", "color-code-function"],
  ["type", "color-code-function"],
  ["predefined", "color-code-function"],
];

// Shiki（TextMate 范围）到变量
const shikiRoles: [string[], string][] = [
  [["keyword", "storage"], "color-code-keyword"],
  [["string"], "color-code-string"],
  [["entity.name.function", "support.function", "variable.other.property"], "color-code-function"],
  [["constant.numeric"], "color-code-number"],
  [["entity.name.tag"], "color-code-tag"],
  [["punctuation", "comment"], "color-code-punctuation"],
];

// xterm 的 16 个颜色到变量；没有单独的终端色板，借用状态色和代码色
const ansi: [string, string][] = [
  ["black", "color-text-secondary-strong"],
  ["red", "color-status-danger-mark"],
  ["green", "color-status-running-mark"],
  ["yellow", "color-status-warning-mark"],
  ["blue", "color-line-accent"],
  ["magenta", "color-code-keyword"],
  ["cyan", "color-code-function"],
  ["white", "color-text-tertiary"],
  ["brightBlack", "color-text-secondary"],
  ["brightRed", "color-status-danger-text"],
  ["brightGreen", "color-status-running-text"],
  ["brightYellow", "color-status-warning-text"],
  ["brightBlue", "color-text-accent"],
  ["brightMagenta", "color-agent-text"],
  ["brightCyan", "color-code-tag"],
  ["brightWhite", "color-text-primary"],
];

function editorColors(pick: Pick): [string, string][] {
  return [
    ["editor.background", pick("color-bg-card")],
    ["editor.foreground", pick("color-code-plain")],
    ["editorLineNumber.foreground", pick("color-code-line-number")],
    ["editorLineNumber.activeForeground", pick("color-code-line-number")],
    ["editor.lineHighlightBackground", pick("color-code-current-line")],
    ["editor.selectionBackground", pick("color-fill-accent-tint")],
    ["editorCursor.foreground", pick("color-line-accent")],
  ];
}

// 滚动条滑块：平时与悬停、拖动两档颜色，和 @runyard/ui 的 ScrollArea 一致（视觉规范第 5 节）
function monacoScrollbarColors(pick: Pick): [string, string][] {
  return [
    ["scrollbar.shadow", "#00000000"],
    ["scrollbarSlider.background", pick("color-scrollbar-thumb")],
    ["scrollbarSlider.hoverBackground", pick("color-scrollbar-thumb-hover")],
    ["scrollbarSlider.activeBackground", pick("color-scrollbar-thumb-hover")],
  ];
}

const q = quote;

function monaco(theme: Theme, pick: Pick): string[] {
  return [
    `  ${theme}: {`,
    `    base: ${q(theme === "light" ? "vs" : "vs-dark")},`,
    "    inherit: true,",
    "    rules: [",
    ...monacoRoles.map(
      ([token, name]) => `      { token: ${q(token)}, foreground: ${q(pick(name).slice(1))} },`,
    ),
    "    ],",
    "    colors: {",
    ...[...editorColors(pick), ...monacoScrollbarColors(pick)].map(
      ([key, value]) => `      ${q(key)}: ${q(value)},`,
    ),
    "    },",
    "  },",
  ];
}

function shiki(theme: Theme, pick: Pick): string[] {
  return [
    `  ${theme}: {`,
    `    name: ${q(`runyard-${theme}`)},`,
    `    type: ${q(theme)},`,
    "    colors: {",
    ...editorColors(pick).map(([key, value]) => `      ${q(key)}: ${q(value)},`),
    "    },",
    "    tokenColors: [",
    ...shikiRoles.flatMap(([scopes, name]) => [
      "      {",
      `        scope: [${scopes.map(q).join(", ")}],`,
      `        settings: { foreground: ${q(pick(name))} },`,
      "      },",
    ]),
    "    ],",
    "  },",
  ];
}

function xterm(theme: Theme, pick: Pick): string[] {
  const entries: [string, string][] = [
    ["background", pick("color-bg-card")],
    ["foreground", pick("color-code-plain")],
    ["cursor", pick("color-line-accent")],
    ["selectionBackground", pick("color-fill-accent-tint")],
    ...ansi.map(([key, name]): [string, string] => [key, pick(name)]),
  ];
  return [`  ${theme}: {`, ...entries.map(([key, value]) => `    ${key}: ${q(value)},`), "  },"];
}

export function renderEditorThemes(source: TokensSource): string {
  const resolved = resolveThemes(source);
  const lines = [HEADER, ""];
  const sections: [string, (theme: Theme, pick: Pick) => string[], string][] = [
    [
      "monacoThemes",
      monaco,
      "Monaco：monaco.editor.defineTheme(名字, monacoThemes.light)，base 和 inherit 已写好",
    ],
    ["shikiThemes", shiki, "Shiki：交给 createHighlighter 的 themes"],
    ["xtermThemes", xterm, "xterm：赋给 terminal.options.theme"],
  ];
  for (const [name, render, doc] of sections) {
    lines.push(`/** ${doc} */`, `export const ${name} = {`);
    for (const theme of themeNames) {
      const table = resolved[theme];
      const pick: Pick = (token) => toHex(table[token] as string);
      lines.push(...render(theme, pick));
    }
    lines.push("} as const;", "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
