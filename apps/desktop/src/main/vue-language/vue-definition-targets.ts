import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isIgnoredProjectPath } from "../../shared/project-ignore.ts";
import { confine } from "../editor-files/confine.ts";

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : value ? [value] : []);
function rangeOf(value: unknown, ts: boolean) {
  const item = record(value);
  const start = record(item.start);
  const end = record(item.end);
  const numbers = [
    start.line,
    ts ? start.offset : start.character,
    end.line,
    ts ? end.offset : end.character,
  ];
  if (numbers.some((value) => !Number.isSafeInteger(value) || (value as number) < (ts ? 1 : 0)))
    return null;
  const [line, character, endLine, endCharacter] = numbers as number[];
  const subtract = ts ? 1 : 0;
  return {
    start: { line: (line ?? 0) - subtract, character: (character ?? 0) - subtract },
    end: { line: (endLine ?? 0) - subtract, character: (endCharacter ?? 0) - subtract },
  };
}
/** 服务器结果也要过边界：只把项目内源码相对路径交给界面，依赖和随包类型不跳转。 */
export async function vueDefinitionTargets(folder: string, value: unknown) {
  const raw = record(value);
  const tsTargets = array(raw.ts);
  const candidates =
    tsTargets.length > 0
      ? tsTargets.map((item) => ({ item: record(item), ts: true }))
      : array(raw.vue).map((item) => ({ item: record(item), ts: false }));
  const targets: { path: string; range: NonNullable<ReturnType<typeof rangeOf>> }[] = [];
  const seen = new Set<string>();
  const { root } = await confine(folder, "");
  for (const { item, ts } of candidates) {
    try {
      const uri = ts ? item.file : (item.targetUri ?? item.uri);
      if (typeof uri !== "string") continue;
      const absolute = ts ? uri : fileURLToPath(uri);
      if (!isAbsolute(absolute)) continue;
      const path = relative(root, absolute).replaceAll("\\", "/");
      if (!path || isIgnoredProjectPath(path)) continue;
      await confine(root, path);
      const range = rangeOf(ts ? item : (item.targetSelectionRange ?? item.range), ts);
      if (!range) continue;
      const key = `${path}:${JSON.stringify(range)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ path, range });
    } catch {
      /* 不把项目外的类型文件和无效 URI 暴露成可打开的目标。 */
    }
  }
  return { targets };
}
