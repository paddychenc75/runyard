import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 读 locales/ 下的文案和备注。仓库检查和包内测试共用这一个读法。
// 只读文件，不解析 ICU；格式问题（不是 JSON、值不是字符串、同一个键在两个文件里）收进 problems。

export interface NoteEntry {
  /** 参数名 → 说明 */
  params: Record<string, string>;
  /** 字数上限（备注里写 "max": 12）；没写就不限 */
  max?: number;
  /** 术语表例外：这条文案里允许不成对的中文术语，和必填的理由 */
  glossarySkip?: string[];
  glossarySkipReason?: string;
}

export interface LoadedCatalogs {
  /** 语言 → 键 → 文案 */
  texts: Record<string, Record<string, string>>;
  /** 语言 → 键 → 所在文件（相对 packages/i18n） */
  files: Record<string, Record<string, string>>;
  /** 键 → 备注（各组备注文件合并，不分语言） */
  notes: Record<string, NoteEntry>;
  problems: string[];
}

export const NOTES_DIR = "notes";

function readJsonFile(path: string, relative: string, problems: string[]): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    problems.push(`${relative} 的顶层必须是一个对象（键 → 值）。改成一层 JSON 对象。`);
  } catch (error) {
    problems.push(`${relative} 不是合法的 JSON（${(error as Error).message}）。修好语法。`);
  }
  return {};
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function toNote(key: string, raw: unknown, relative: string, problems: string[]): NoteEntry {
  const note: NoteEntry = { params: {} };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    problems.push(`${relative} 里 ${key} 的备注必须是对象（参数名 → 说明）。`);
    return note;
  }
  for (const [name, value] of Object.entries(raw)) {
    if (name === "max" && typeof value === "number") note.max = value;
    else if (name === "glossarySkip" && Array.isArray(value)) note.glossarySkip = value.map(String);
    else if (name === "glossarySkipReason" && typeof value === "string") {
      note.glossarySkipReason = value;
    } else if (typeof value === "string") note.params[name] = value;
    else problems.push(`${relative} 里 ${key} 的备注 ${name} 必须是字符串。`);
  }
  return note;
}

export function loadCatalogs(packageDir: string): LoadedCatalogs {
  const localesDir = join(packageDir, "locales");
  const result: LoadedCatalogs = { texts: {}, files: {}, notes: {}, problems: [] };
  if (!existsSync(localesDir)) {
    result.problems.push("找不到 packages/i18n/locales/。文案目录是国际化的唯一出处，恢复它。");
    return result;
  }
  const localeDirs = readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== NOTES_DIR)
    .map((entry) => entry.name)
    .sort();
  for (const locale of localeDirs) {
    const texts: Record<string, string> = {};
    const files: Record<string, string> = {};
    for (const name of jsonFiles(join(localesDir, locale))) {
      const relative = `locales/${locale}/${name}`;
      const content = readJsonFile(join(localesDir, locale, name), relative, result.problems);
      for (const [key, value] of Object.entries(content)) {
        if (typeof value !== "string") {
          result.problems.push(`${relative} 里 ${key} 的值不是字符串。文案的值必须是 ICU 字符串。`);
          continue;
        }
        if (key in texts) {
          result.problems.push(
            `${key} 同时出现在 ${files[key]} 和 ${relative}。一个键只许出现在一处：删掉其中一个。`,
          );
          continue;
        }
        texts[key] = value;
        files[key] = relative;
      }
    }
    result.texts[locale] = texts;
    result.files[locale] = files;
  }
  const notesDir = join(localesDir, NOTES_DIR);
  if (existsSync(notesDir)) {
    for (const name of jsonFiles(notesDir)) {
      const relative = `locales/${NOTES_DIR}/${name}`;
      const content = readJsonFile(join(notesDir, name), relative, result.problems);
      for (const [key, raw] of Object.entries(content)) {
        result.notes[key] = toNote(key, raw, relative, result.problems);
      }
    }
  }
  return result;
}
