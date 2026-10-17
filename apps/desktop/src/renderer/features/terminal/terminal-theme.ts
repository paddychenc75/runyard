import { numbers, themes, xtermThemes } from "@runyard/tokens";

// 终端的配色、字体、行高（规格 desktop/terminal「外观跟随设计变量和主题」）：xterm 不认 CSS 变量，
// 要真实色值，所以取自 @runyard/tokens 生成的 xtermThemes 和主题表，浅色深色各一套，切主题时换一张表。

export type TerminalAppearance = "light" | "dark";

/** 设计稿 Script、WebLight 画板：12 像素的等宽字、21 像素的行高（见下面的倍数） */
export const TERMINAL_FONT_SIZE = numbers["text-code-small-size"];
/** xterm 的行高是字高的倍数；SF Mono 12 号字高约 14，乘 1.5 得设计稿的 21 像素 */
export const TERMINAL_LINE_HEIGHT = 1.5;
/** 终端用的等宽字体栈，与 --font-mono 一致 */
export const TERMINAL_FONT_FAMILY = '"SF Mono", Menlo, monospace';

export interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionInactiveBackground: string;
  scrollbarSliderBackground: string;
  scrollbarSliderHoverBackground: string;
  scrollbarSliderActiveBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export function terminalTheme(appearance: TerminalAppearance): TerminalColors {
  const palette = xtermThemes[appearance];
  const tokens = themes[appearance];
  return {
    ...palette,
    // 设计稿：正文是“次要强调”灰，光标是正文色的实心方块，里面的字用背景色
    foreground: tokens["color-text-secondary-strong"],
    cursor: tokens["color-text-primary"],
    cursorAccent: palette.background,
    selectionInactiveBackground: palette.selectionBackground,
    // 统一滚动条的滑块色（视觉规范第 5 节）
    scrollbarSliderBackground: tokens["color-scrollbar-thumb"],
    scrollbarSliderHoverBackground: tokens["color-scrollbar-thumb-hover"],
    scrollbarSliderActiveBackground: tokens["color-scrollbar-thumb-hover"],
  };
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** 变量表里的 `rgba(r, g, b, a)` 拆成三个通道和透明度 */
function parseRgba(color: string): { rgb: [number, number, number]; alpha: number } {
  const match = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(color);
  if (match === null) throw new Error(`not an rgba colour: ${color}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** 把 top 以 alpha 的不透明度叠在 bottom 上，得到不带透明度的 #RRGGBB（xterm 的查找高亮不收带透明度的色值） */
export function blend(top: string, bottom: string, alpha: number): string {
  const a = channels(top);
  const b = channels(bottom);
  return toHex(a.map((channel, index) => channel * alpha + (b[index] ?? 0) * (1 - alpha)));
}

/** 带透明度的变量叠在背景上得到的实色 */
function over(color: string, background: string): string {
  const { rgb, alpha } = parseRgba(color);
  const bottom = channels(background);
  return toHex(rgb.map((channel, index) => channel * alpha + (bottom[index] ?? 0) * (1 - alpha)));
}

export interface FindDecorations {
  matchBackground: string;
  matchOverviewRuler: string;
  activeMatchBackground: string;
  activeMatchBorder: string;
  activeMatchColorOverviewRuler: string;
}

/** 查找高亮（设计稿 TerminalFind）：别的结果是淡黄，当前这个是橙色并带强调色描边；两个颜色都是设计变量 */
export function findDecorations(appearance: TerminalAppearance): FindDecorations {
  const tokens = themes[appearance];
  const background = xtermThemes[appearance].background;
  const accent = tokens["color-line-accent"];
  return {
    matchBackground: over(tokens["color-fill-find-match"], background),
    matchOverviewRuler: tokens["color-status-warning-mark"],
    activeMatchBackground: over(tokens["color-fill-find-active"], background),
    activeMatchBorder: accent,
    activeMatchColorOverviewRuler: accent,
  };
}
