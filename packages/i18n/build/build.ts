import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CatalogFile, generateMessagesTypes } from "./generate-messages-types.ts";

// pnpm i18n:build：读 locales/zh-CN/*.json，生成 generated/messages.d.ts。
// 只许有一个源语言；英文要和它的键、参数一致，那是 i18n-keys 检查的事（issue #23）。

export function readSourceCatalogs(packageDir: string): Record<string, CatalogFile> {
  const dir = join(packageDir, "locales", "zh-CN");
  const files: Record<string, CatalogFile> = {};
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    files[`locales/zh-CN/${name}`] = JSON.parse(readFileSync(join(dir, name), "utf8"));
  }
  return files;
}

export const GENERATED_FILE = "generated/messages.d.ts";

export function buildMessagesTypes(packageDir: string): string {
  return generateMessagesTypes(readSourceCatalogs(packageDir));
}

if (import.meta.main) {
  const packageDir = join(import.meta.dirname, "..");
  const target = join(packageDir, GENERATED_FILE);
  const content = buildMessagesTypes(packageDir);
  mkdirSync(join(packageDir, "generated"), { recursive: true });
  writeFileSync(target, content);
  console.log(`已生成  packages/i18n/${GENERATED_FILE}`);
}
