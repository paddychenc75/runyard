import type { LoadedCatalogs } from "./load-catalogs.ts";

// docs/reference/strings.md：一行一个键（中文、英文、备注），审文案时看这张表，不用打开 JSON
//（技术设计 §6.8）。整个文件是生成的，generated-fresh 核对它是最新的。

const cell = (text: string | undefined) =>
  (text ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");

export function renderStrings(c: LoadedCatalogs, source: string, fallback: string): string {
  const zh = c.texts[source] ?? {};
  const en = c.texts[fallback] ?? {};
  const keys = [...new Set([...Object.keys(zh), ...Object.keys(en)])].sort();
  const rows = keys.map((key) => {
    const note = c.notes[key];
    const parts = Object.entries(note?.params ?? {}).map(([name, text]) => `${name}：${text}`);
    if (note?.max !== undefined) parts.push(`最多 ${note.max} 个字符`);
    return `| ${cell(key)} | ${cell(zh[key])} | ${cell(en[key])} | ${cell(parts.join("；") || undefined)} |`;
  });
  return [
    "# 文案一览",
    "",
    "<!-- 由 pnpm generate 生成，不要手改。来源：packages/i18n/locales/ -->",
    "",
    "一行一个键：中文是源语言，英文在同一个 PR 里补齐。改文案去 `packages/i18n/locales/`，再运行 `pnpm generate`。",
    "",
    "| 键 | 中文 | 英文 | 备注 |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
