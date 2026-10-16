import { type ScaleGroup, scaleValue, type TokensSource } from "./model.ts";
import { quote } from "./quote.ts";
import { resolveThemes, themeNames } from "./resolved.ts";

// 生成 tokens.ts：主进程取窗口底色、截图测试取尺寸时用。只含语义级变量（基础级不出现在 TS 里）。
// 排版写得和 Biome 的格式化结果一致，两边才不会一个说过期、一个说格式不对。

const HEADER =
  "// 由 pnpm tokens:build 生成，不要手改。要改就改 packages/tokens/src/tokens.json（技术设计 §6.7）。";

const q = quote;

// 一行放不下（100 列）时，Biome 把值挪到下一行再缩进两格
function record(entries: [string, string][], indent: string): string[] {
  return entries.flatMap(([key, value]) => {
    const line = `${indent}${q(key)}: ${value},`;
    return line.length <= 100 ? [line] : [`${indent}${q(key)}:`, `${indent}  ${value},`];
  });
}

function numericEntries(scales: ScaleGroup[]): [string, string][] {
  return scales.flatMap((group) =>
    group.tokens
      .filter((token) => typeof token.value === "number")
      .map((token): [string, string] => [token.name, String(token.value)]),
  );
}

function constantEntries(scales: ScaleGroup[]): [string, string][] {
  return scales.flatMap((group) =>
    group.tokens.map((token): [string, string] => [token.name, q(scaleValue(group, token))]),
  );
}

export function renderTs(source: TokensSource): string {
  const resolved = resolveThemes(source);
  const lines = [HEADER, ""];
  lines.push(
    "/** 随浅色、深色变化的变量（颜色和阴影），值是最终写法，没有 CSS 变量引用 */",
    "export const themes = {",
  );
  for (const theme of themeNames) {
    lines.push(
      `  ${theme}: {`,
      ...record(
        Object.entries(resolved[theme]).map(([k, v]) => [k, q(v)]),
        "    ",
      ),
      "  },",
    );
  }
  lines.push("} as const;", "");
  lines.push(
    "/** 两个主题下相同的变量，值与写进 CSS 的完全一致（带单位） */",
    "export const constants = {",
  );
  lines.push(...record(constantEntries(source.scales), "  "), "} as const;", "");
  lines.push(
    "/** 同一批变量里能当数字用的（像素、毫秒、字重、层级），截图测试按它取尺寸 */",
    "export const numbers = {",
  );
  lines.push(...record(numericEntries(source.scales), "  "), "} as const;", "");
  lines.push(
    "export type ThemedTokenName = keyof typeof themes.light;",
    "export type ConstantTokenName = keyof typeof constants;",
    "export type TokenName = ThemedTokenName | ConstantTokenName;",
    "export type NumericTokenName = keyof typeof numbers;",
    'export type ThemeName = "light" | "dark";',
    "",
    "/** 主进程建窗口前用它设 backgroundColor，窗口先不显示，避免启动时闪白（技术设计 §6.7） */",
    "export const windowBackground = {",
  );
  for (const theme of themeNames) {
    lines.push(
      `  ${theme}: {`,
      `    library: themes.${theme}["color-bg-window"],`,
      `    workspace: themes.${theme}["color-bg-workspace"],`,
      "  },",
    );
  }
  lines.push("} as const;");
  return `${lines.join("\n")}\n`;
}
