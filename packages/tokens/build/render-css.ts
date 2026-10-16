import {
  allThemedTokens,
  referenceOf,
  type ScaleGroup,
  scaleValue,
  type ThemedGroup,
  type ThemedToken,
  type TokensSource,
} from "./model.ts";

// 生成 tokens.css。颜色用 light-dark()，一个变量里写两个值；它只接受颜色，
// 所以阴影（整段值）改用主题选择器分别写。主题的切换规则见技术设计 §6.7：
// 不写 data-theme 就跟随系统，写 light / dark 就强制。

const HEADER =
  "/* 由 pnpm tokens:build 生成，不要手改。要改就改 packages/tokens/src/tokens.json（技术设计 §6.7）。 */";

const color = (value: string): string => {
  const ref = referenceOf(value);
  return ref === undefined ? value : `var(--${ref})`;
};

const lightDark = (token: ThemedToken): string =>
  `light-dark(${color(token.light)}, ${color(token.dark)})`;

const WIDTH = 100;

// Biome 会把放不下一行的逗号列表（多层阴影）按“尽量填满一行”重排，这里先写成同样的样子
function declaration(name: string, value: string, indent: string): string[] {
  const line = `${indent}--${name}: ${value};`;
  if (line.length <= WIDTH || !value.includes("), ")) return [line];
  const layers = value.split(/(?<=\)), (?=\S)/);
  const inner = `${indent}  `;
  const rows: string[] = [];
  let row = inner;
  layers.forEach((layer, index) => {
    const piece = index < layers.length - 1 ? `${layer},` : `${layer};`;
    const candidate = row === inner ? `${row}${piece}` : `${row} ${piece}`;
    if (candidate.length > WIDTH && row !== inner) {
      rows.push(row);
      row = `${inner}${piece}`;
    } else row = candidate;
  });
  rows.push(row);
  return [`${indent}--${name}:`, ...rows];
}

function declarations(entries: [string, string][], indent: string): string[] {
  return entries.flatMap(([name, value]) => declaration(name, value, indent));
}

function colorEntries(groups: ThemedGroup[]): [string, string][] {
  return groups
    .filter((group) => group.kind === "color")
    .flatMap((group) =>
      group.tokens.map((token): [string, string] => [token.name, lightDark(token)]),
    );
}

function shadowTokens(groups: ThemedGroup[]): ThemedToken[] {
  return groups.filter((group) => group.kind === "shadow").flatMap((group) => group.tokens);
}

function scaleEntries(scales: ScaleGroup[]): [string, string][] {
  return scales.flatMap((group) =>
    group.tokens.map((token): [string, string] => [token.name, scaleValue(group, token)]),
  );
}

function reducedTransparency(source: TokensSource): string[] {
  const entries = allThemedTokens(source)
    .filter((token) => token.opaque !== undefined)
    .map((token): [string, string] => [
      token.name,
      `light-dark(${color((token.opaque as { light: string }).light)}, ${color((token.opaque as { dark: string }).dark)})`,
    ]);
  return [
    "@media (prefers-reduced-transparency: reduce) {",
    "  :root {",
    ...declarations(entries, "    "),
    "  }",
    "}",
  ];
}

export function renderCss(source: TokensSource): string {
  const shadows = shadowTokens(source.themed);
  const dark = (indent: string) =>
    declarations(
      shadows.map((token): [string, string] => [token.name, token.dark]),
      indent,
    );
  const lines = [
    HEADER,
    "",
    ":root {",
    "  color-scheme: light dark;",
    ...declarations(Object.entries(source.base), "  "),
    ...declarations(colorEntries(source.themed), "  "),
    ...declarations(
      shadows.map((token): [string, string] => [token.name, token.light]),
      "  ",
    ),
    ...declarations(scaleEntries(source.scales), "  "),
    "}",
    "",
    ':root[data-theme="light"] {',
    "  color-scheme: light;",
    "}",
    "",
    ':root[data-theme="dark"] {',
    "  color-scheme: dark;",
    ...dark("  "),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    ...dark("    "),
    "  }",
    "}",
    "",
    ...reducedTransparency(source),
  ];
  // Biome 的 CSS 格式化会把十六进制颜色改成小写，这里直接写成小写，两边才一致
  return `${lines.join("\n").replace(/#[0-9A-Fa-f]{6}\b/g, (hex) => hex.toLowerCase())}\n`;
}
