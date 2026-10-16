import { readFileSync } from "node:fs";
import { join } from "node:path";

// tokens.json 的形状、读取与校验。校验的目的是让“范围值”“漏写深色”“引用不存在的基础变量”
// 这类错在生成之前就变红，而不是生成出一个坏的 CSS（技术设计 §6.7）。

export interface ThemedToken {
  name: string;
  role: string;
  light: string;
  dark: string;
  /** 开了“降低透明度”后换成的不透明底色（只有玻璃背景有） */
  opaque?: { light: string; dark: string };
}

export interface ThemedGroup {
  id: string;
  title: string;
  /** color：两个值都是颜色，用 light-dark()；shadow：整段阴影，用主题选择器分别写 */
  kind: "color" | "shadow";
  tokens: ThemedToken[];
}

export interface ScaleToken {
  name: string;
  role: string;
  value: number | string;
}

export interface ScaleGroup {
  id: string;
  title: string;
  /** 数字值带的单位；字符串值原样输出 */
  unit: "px" | "ms" | "";
  tokens: ScaleToken[];
}

export interface TokensSource {
  base: Record<string, string>;
  themed: ThemedGroup[];
  scales: ScaleGroup[];
}

export const tokenPrefixes = [
  "color-",
  "glass-",
  "shadow-",
  "radius-",
  "space-",
  "size-",
  "font-",
  "text-",
  "motion-",
  "z-",
] as const;

const SOLID = /^#[0-9A-Fa-f]{6}$/;
const RGBA = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\)$/;
const REF = /^\{([a-z0-9-]+)\}$/;

export function loadTokens(packageDir: string): TokensSource {
  return JSON.parse(readFileSync(join(packageDir, "src", "tokens.json"), "utf8")) as TokensSource;
}

export function referenceOf(value: string): string | undefined {
  return REF.exec(value)?.[1];
}

/** 把 `{基础名}` 换成基础级的原始值；不是引用就原样返回 */
export function resolveColor(value: string, base: Record<string, string>): string {
  const ref = referenceOf(value);
  return ref === undefined ? value : (base[ref] as string);
}

function isColor(value: string, base: Record<string, string>): boolean {
  const ref = referenceOf(value);
  if (ref !== undefined) return ref in base;
  return SOLID.test(value) || RGBA.test(value);
}

function checkColors(token: ThemedToken, base: Record<string, string>, errors: string[]): void {
  const values = [token.light, token.dark, token.opaque?.light, token.opaque?.dark];
  for (const value of values) {
    if (value !== undefined && !isColor(value, base)) {
      errors.push(
        `${token.name} 的值“${value}”不是单个颜色（写成 #RRGGBB、rgba(r, g, b, a) 或 {基础名}；范围值要定成一个）。`,
      );
    }
  }
}

export function validateTokens(source: TokensSource): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const claim = (name: string) => {
    if (seen.has(name)) errors.push(`变量名 ${name} 重复。`);
    seen.add(name);
  };
  for (const [name, value] of Object.entries(source.base)) {
    claim(name);
    if (!SOLID.test(value)) errors.push(`基础变量 ${name} 的值“${value}”不是 #RRGGBB。`);
    if (tokenPrefixes.some((prefix) => name.startsWith(prefix))) {
      errors.push(`基础变量 ${name} 用了语义级前缀，基础级不带这些前缀。`);
    }
  }
  const hasPrefix = (name: string) => tokenPrefixes.some((prefix) => name.startsWith(prefix));
  for (const group of source.themed) {
    for (const token of group.tokens) {
      claim(token.name);
      if (!hasPrefix(token.name)) errors.push(`${token.name} 的前缀不在允许的清单里。`);
      if (group.kind === "color") checkColors(token, source.base, errors);
      else if (token.opaque) errors.push(`${token.name}：只有颜色组可以写 opaque。`);
    }
  }
  for (const group of source.scales) {
    for (const token of group.tokens) {
      claim(token.name);
      if (!hasPrefix(token.name)) errors.push(`${token.name} 的前缀不在允许的清单里。`);
      if (
        typeof token.value === "number" &&
        group.unit === "" &&
        token.name.startsWith("radius-")
      ) {
        errors.push(`${token.name} 是数字却没有单位，圆角要写 px。`);
      }
    }
  }
  return errors;
}

export function allThemedTokens(source: TokensSource): ThemedToken[] {
  return source.themed.flatMap((group) => group.tokens);
}

/** 一个标量变量最终写进 CSS 的值（数字补单位） */
export function scaleValue(group: ScaleGroup, token: ScaleToken): string {
  return typeof token.value === "number" ? `${token.value}${group.unit}` : token.value;
}
