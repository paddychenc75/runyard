import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTokens, validateTokens } from "./model.ts";
import { renderCss } from "./render-css.ts";
import { renderDocTables } from "./render-doc.ts";
import { renderEditorThemes } from "./render-editor.ts";
import { renderTs } from "./render-ts.ts";

// pnpm tokens:build：从 src/tokens.json 生成 generated/ 下的三个文件，并重写 docs/design/tokens.md 的生成段。
// pnpm generate 也会调用同一份代码（tooling/scripts/generate.ts），generated-fresh 检查靠它核对。

export const GENERATED_FILES = {
  css: "generated/tokens.css",
  ts: "generated/tokens.ts",
  editor: "generated/editor-themes.ts",
} as const;

export const DOC_FILE = "docs/design/tokens.md";
export const DOC_BEGIN = "<!-- generated:tokens 开始（由 pnpm tokens:build 生成，不要手改） -->";
export const DOC_END = "<!-- generated:tokens 结束 -->";

export interface TokensOutput {
  /** 相对包目录 */
  css: string;
  ts: string;
  editor: string;
  /** tokens.md 两个标记之间的内容 */
  docTables: string;
}

export function buildTokens(packageDir: string): TokensOutput {
  const source = loadTokens(packageDir);
  const errors = validateTokens(source);
  if (errors.length > 0) {
    throw new Error(
      `packages/tokens/src/tokens.json 有问题，改完再运行 pnpm tokens:build：\n${errors.join("\n")}`,
    );
  }
  return {
    css: renderCss(source),
    ts: renderTs(source),
    editor: renderEditorThemes(source),
    docTables: renderDocTables(source),
  };
}

/** 把生成段放回 tokens.md；找不到标记返回 undefined */
export function replaceDocBlock(text: string, block: string): string | undefined {
  const start = text.indexOf(DOC_BEGIN);
  const end = text.indexOf(DOC_END);
  if (start === -1 || end === -1 || end < start) return undefined;
  return `${text.slice(0, start)}${DOC_BEGIN}\n\n${block}\n\n${text.slice(end)}`;
}

if (import.meta.main) {
  const packageDir = join(import.meta.dirname, "..");
  const root = join(packageDir, "..", "..");
  const out = buildTokens(packageDir);
  for (const [key, path] of Object.entries(GENERATED_FILES)) {
    mkdirSync(dirname(join(packageDir, path)), { recursive: true });
    writeFileSync(join(packageDir, path), out[key as keyof typeof GENERATED_FILES]);
    console.log(`已生成  packages/tokens/${path}`);
  }
  const doc = readFileSync(join(root, DOC_FILE), "utf8");
  const next = replaceDocBlock(doc, out.docTables);
  if (next === undefined)
    throw new Error(`${DOC_FILE} 里找不到生成标记：\n${DOC_BEGIN}\n${DOC_END}`);
  writeFileSync(join(root, DOC_FILE), next);
  console.log(`已更新  ${DOC_FILE}`);
}
