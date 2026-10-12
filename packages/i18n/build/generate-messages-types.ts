import { paramTypesOf } from "./icu-params.ts";

// 把中文（源语言）文案生成 generated/messages.d.ts 的内容。纯函数，不读文件。
// 错误码、提示码、运行状态三族的键和参数不在这里生成：它们由 protocol 的登记表在类型层推出
// （src/messages.ts），文案 JSON 里同名前缀的键在这里跳过，免得出现第二个出处。

export type CatalogFile = Readonly<Record<string, string>>;

export const codeKeyPrefixes = ["errors.", "notice.", "runState."] as const;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const q = (text: string) => JSON.stringify(text);
const member = (name: string) => (IDENTIFIER.test(name) ? name : q(name));

export function generateMessagesTypes(files: Readonly<Record<string, CatalogFile>>): string {
  const entries = new Map<string, Map<string, string>>();
  for (const [file, messages] of Object.entries(files)) {
    for (const [key, message] of Object.entries(messages)) {
      if (codeKeyPrefixes.some((prefix) => key.startsWith(prefix))) continue;
      if (entries.has(key)) throw new Error(`键 ${key} 在 ${file} 里重复：一个键只许出现在一处`);
      try {
        entries.set(key, paramTypesOf(message));
      } catch (error) {
        throw new Error(`${file} 的键 ${key} 不是合法的 ICU 文案：${String(error)}`);
      }
    }
  }
  const lines = [
    "// 由 pnpm i18n:build 生成，不要手改。来源：locales/zh-CN/*.json（技术设计 §6.8）",
    "",
  ];
  if (entries.size === 0) {
    lines.push("export type CatalogMessages = Record<never, never>;");
  } else {
    lines.push("export type CatalogMessages = {");
    for (const key of [...entries.keys()].sort()) {
      const params = [...(entries.get(key) ?? new Map<string, string>())].sort(([a], [b]) =>
        a < b ? -1 : 1,
      );
      if (params.length === 0) {
        lines.push(`  ${q(key)}: Record<never, never>;`);
        continue;
      }
      lines.push(`  ${q(key)}: {`);
      for (const [name, type] of params) lines.push(`    ${member(name)}: ${type};`);
      lines.push("  };");
    }
    lines.push("};");
  }
  return `${lines.join("\n")}\n`;
}
