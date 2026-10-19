import { toHex } from "./color.ts";
import type { TokensSource } from "./model.ts";
import { quote } from "./quote.ts";
import { resolveThemes, type Theme, themeNames } from "./resolved.ts";

// 生成 editor-themes.ts：Monaco、Shiki、xterm 不认 CSS 变量，要真实色值（技术设计 §6.7）。
// 颜色全部从 tokens.json 的语义级变量取，这里只决定“哪个角色用哪个变量”和各库的字段名。

const HEADER =
  "// 由 pnpm tokens:build 生成，不要手改。要改就改 packages/tokens/src/tokens.json（技术设计 §6.7）。";

type Pick = (name: string) => string;

// Shiki（TextMate 范围）到变量
const shikiRoles: [string[], string][] = [
  [["keyword", "storage"], "color-code-keyword"],
  [["string"], "color-code-string"],
  [["entity.name.function", "support.function", "variable.other.property"], "color-code-function"],
  [["constant.numeric"], "color-code-number"],
  [["entity.name.tag"], "color-code-tag"],
  [["punctuation", "comment"], "color-code-punctuation"],
  // 设计稿只画了上面 6 类；CSS 属性名、HTML 与 Vue 模板的属性名、JSON 的键、Markdown 也要着色
  // （DESKTOP-EDITOR-37、38）。JSX 里的 className 照设计稿保持正文色，所以只登记 HTML 的属性名
  [
    [
      "support.type.property-name",
      "meta.property-name",
      "entity.other.attribute-name.html",
      "entity.other.attribute-name.id.html",
    ],
    "color-code-property",
  ],
  [["markup.heading", "markup.heading.markdown"], "color-code-heading"],
  [["markup.bold", "markup.italic"], "color-code-emphasis"],
  [["markup.inline.raw", "markup.fenced_code"], "color-code-raw"],
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

// 补全列表、悬停、参数提示等浮层（第 3 档）：颜色走这里，形状（圆角、阴影、行高）见 monaco-widgets.css。
// 选中行用强调色浅底、文字仍是正文色，不用 VS Code 的饱和蓝整条填充。
function monacoWidgetColors(pick: Pick): [string, string][] {
  const clear = "#00000000";
  return [
    ["editorWidget.background", pick("glass-dialog-bg")],
    ["editorWidget.foreground", pick("color-text-primary")],
    ["editorWidget.border", clear],
    ["editorWidget.resizeBorder", pick("color-line-accent")],
    ["widget.shadow", clear],
    ["editorSuggestWidget.background", pick("glass-dialog-bg")],
    ["editorSuggestWidget.foreground", pick("color-text-primary")],
    ["editorSuggestWidget.border", clear],
    ["editorSuggestWidget.selectedForeground", pick("color-text-primary")],
    ["editorSuggestWidget.selectedBackground", pick("color-fill-accent-tint")],
    ["editorSuggestWidget.highlightForeground", pick("color-text-accent")],
    ["editorSuggestWidget.focusHighlightForeground", pick("color-text-accent")],
    ["editorSuggestWidgetStatus.foreground", pick("color-text-secondary")],
    ["editorHoverWidget.background", pick("glass-dialog-bg")],
    ["editorHoverWidget.foreground", pick("color-text-primary")],
    ["editorHoverWidget.border", clear],
    ["editorHoverWidget.statusBarBackground", clear],
    ["list.hoverBackground", pick("color-fill-neutral")],
    ["list.hoverForeground", pick("color-text-primary")],
    ["list.activeSelectionBackground", pick("color-fill-accent-tint")],
    ["list.activeSelectionForeground", pick("color-text-primary")],
    ["list.focusBackground", pick("color-fill-accent-tint")],
    ["list.focusForeground", pick("color-text-primary")],
    ["list.highlightForeground", pick("color-text-accent")],
    ["textLink.foreground", pick("color-text-link")],
    ["textLink.activeForeground", pick("color-text-link")],
    ["editorLink.activeForeground", pick("color-text-link")],
    ["textCodeBlock.background", pick("color-fill-neutral")],
    ["textSeparator.foreground", pick("color-line-hairline")],
  ];
}

const q = quote;

// 一行放得下就写一行，放不下每项占一行（和 Biome 的排版一致）
function scopeLines(scopes: string[]): string[] {
  const oneLine = `        scope: [${scopes.map(q).join(", ")}],`;
  if (oneLine.length <= 100) return [oneLine];
  return ["        scope: [", ...scopes.map((scope) => `          ${q(scope)},`), "        ],"];
}

function shiki(theme: Theme, pick: Pick): string[] {
  return [
    `  ${theme}: {`,
    `    name: ${q(`runyard-${theme}`)},`,
    `    type: ${q(theme)},`,
    "    colors: {",
    // 运行时真正用的是这一份（@shikijs/monaco 把它转成 Monaco 主题），所以浮层的颜色也要在这里
    ...[...editorColors(pick), ...monacoScrollbarColors(pick), ...monacoWidgetColors(pick)].map(
      ([key, value]) => `      ${q(key)}: ${q(value)},`,
    ),
    "    },",
    "    tokenColors: [",
    ...shikiRoles.flatMap(([scopes, name]) => [
      "      {",
      ...scopeLines(scopes),
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
      "shikiThemes",
      shiki,
      "Shiki：唯一的编辑器配色，交给 createHighlighter 并经 shikiToMonaco 注册",
    ],
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
