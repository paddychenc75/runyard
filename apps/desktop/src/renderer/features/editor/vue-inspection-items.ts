import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { IGNORED_DIAGNOSTIC_CODES } from "./typescript-defaults.ts";

export const vueRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
export function vueRange(value: unknown, ts = false): Monaco.IRange | undefined {
  const record = vueRecord(value);
  const start = vueRecord(record.start);
  const end = vueRecord(record.end);
  const left = ts ? start.offset : start.character;
  const right = ts ? end.offset : end.character;
  if (!integer(start.line) || !integer(end.line) || !integer(left) || !integer(right)) return;
  const add = ts ? 0 : 1;
  if (start.line + add < 1 || end.line + add < 1 || left + add < 1 || right + add < 1) return;
  return {
    startLineNumber: start.line + add,
    startColumn: left + add,
    endLineNumber: end.line + add,
    endColumn: right + add,
  };
}
function text(value: unknown, depth = 0): string {
  if (typeof value === "string") return value;
  if (depth > 12) return "";
  if (Array.isArray(value)) return value.map((part) => text(part, depth + 1)).join("");
  const record = vueRecord(value);
  const own =
    typeof record.text === "string"
      ? record.text
      : typeof record.messageText === "string"
        ? record.messageText
        : "";
  return (
    own +
    array(record.next)
      .map((item) => `\n${text(item, depth + 1)}`)
      .join("")
  );
}
const markdown = (value: string): Monaco.IMarkdownString => ({
  value,
  isTrusted: false,
  supportHtml: false,
});
function codeBlock(value: string, language = "typescript"): string {
  const longest = Math.max(2, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${/^[\w-]+$/.test(language) ? language : ""}\n${value}\n${fence}`;
}
export function vueHover(value: unknown): Monaco.languages.Hover | null {
  const raw = vueRecord(value);
  const ts = vueRecord(raw.ts);
  const vue = vueRecord(raw.vue);
  const contents: Monaco.IMarkdownString[] = [];
  const display = text(ts.displayString);
  if (display) contents.push(markdown(codeBlock(display)));
  const documentation = text(ts.documentation);
  if (documentation) contents.push(markdown(documentation));
  for (const item of Array.isArray(vue.contents) ? vue.contents : [vue.contents]) {
    const record = vueRecord(item);
    const body =
      typeof item === "string" ? item : typeof record.value === "string" ? record.value : "";
    if (!body || body === display || body === documentation) continue;
    contents.push(
      markdown(typeof record.language === "string" ? codeBlock(body, record.language) : body),
    );
  }
  const range = vueRange(ts, true) ?? vueRange(vue.range);
  return contents.length === 0 ? null : { contents, ...(range ? { range } : {}) };
}
export function vueDiagnosticMarkers(
  value: unknown,
  severity: typeof Monaco.MarkerSeverity,
): Monaco.editor.IMarkerData[] {
  const raw = vueRecord(value);
  const ignored = new Set<number>(IGNORED_DIAGNOSTIC_CODES);
  const markers: Monaco.editor.IMarkerData[] = [];
  const seen = new Set<string>();
  const diagnostics = [
    ...array(raw.syntax).map((item) => ({ item: vueRecord(item), ts: true })),
    ...array(raw.semantic).map((item) => ({ item: vueRecord(item), ts: true })),
    ...array(raw.vue).map((item) => ({ item: vueRecord(item), ts: false })),
  ];
  for (const { item, ts } of diagnostics) {
    const code =
      typeof item.code === "string" || typeof item.code === "number" ? String(item.code) : "";
    if (ignored.has(Number(code))) continue;
    const range = vueRange(ts ? item : item.range, ts);
    if (!range) continue;
    const message = text(item.text ?? item.messageText ?? item.message);
    if (!message) continue;
    const key = `${code || message}:${JSON.stringify(range)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const level = ts
      ? item.category === "warning"
        ? severity.Warning
        : item.category === "suggestion"
          ? severity.Hint
          : severity.Error
      : item.severity === 2
        ? severity.Warning
        : item.severity === 3
          ? severity.Info
          : item.severity === 4
            ? severity.Hint
            : severity.Error;
    markers.push({ ...range, message, severity: level, source: "vue", ...(code ? { code } : {}) });
  }
  return markers;
}
