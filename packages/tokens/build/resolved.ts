import { allThemedTokens, resolveColor, type TokensSource } from "./model.ts";

export type Theme = "light" | "dark";
export const themeNames: Theme[] = ["light", "dark"];

/** 每个主题下，每个有主题的变量最终的值（基础级引用已换成原始值） */
export function resolveThemes(source: TokensSource): Record<Theme, Record<string, string>> {
  const result: Record<Theme, Record<string, string>> = { light: {}, dark: {} };
  const kinds = new Map(
    source.themed.flatMap((g) => g.tokens.map((t) => [t.name, g.kind] as const)),
  );
  for (const token of allThemedTokens(source)) {
    for (const theme of themeNames) {
      const value = token[theme];
      (result[theme] as Record<string, string>)[token.name] =
        kinds.get(token.name) === "color" ? resolveColor(value, source.base) : value;
    }
  }
  return result;
}
