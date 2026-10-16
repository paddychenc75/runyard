import { type ScaleGroup, scaleValue, type TokensSource } from "./model.ts";

// 生成 docs/design/tokens.md 里两个标记之间的表格（设计稿和它不一致时以 tokens.json 为准）。

const cell = (text: string) => text.replaceAll("|", "\\|");

function themedSection(
  title: string,
  rows: { role: string; light: string; dark: string }[],
): string[] {
  return [
    `### ${title}`,
    "",
    "| Role | Light | Dark |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${cell(row.role)} | ${cell(row.light)} | ${cell(row.dark)} |`),
    "",
  ];
}

function scaleSection(group: ScaleGroup): string[] {
  return [
    `### ${group.title}`,
    "",
    "| Variable | Value | Role |",
    "| --- | --- | --- |",
    ...group.tokens.map(
      (token) =>
        `| \`--${token.name}\` | ${cell(scaleValue(group, token))} | ${cell(token.role)} |`,
    ),
    "",
  ];
}

export function renderDocTables(source: TokensSource): string {
  const lines: string[] = [];
  for (const group of source.themed) {
    const rows = group.tokens.map((token) => ({
      role: `${token.role} (\`--${token.name}\`)`,
      light: token.light.replace(/^\{(.+)\}$/, (_, ref: string) => source.base[ref] as string),
      dark: token.dark.replace(/^\{(.+)\}$/, (_, ref: string) => source.base[ref] as string),
    }));
    lines.push(...themedSection(group.title, rows));
  }
  for (const group of source.scales) lines.push(...scaleSection(group));
  return lines.join("\n").trimEnd();
}
