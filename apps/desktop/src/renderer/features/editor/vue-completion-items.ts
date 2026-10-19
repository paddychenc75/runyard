import type * as Monaco from "monaco-editor/editor/editor.api.js";

export interface VueCompletionItem extends Monaco.languages.CompletionItem {
  vueDetailId: string;
  vueSession: string;
  vueVersion: number;
}
interface Options {
  kinds: typeof Monaco.languages.CompletionItemKind;
  range: Monaco.IRange;
  session: string;
  version: number;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
const string = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
function lspRange(value: unknown): Monaco.IRange | undefined {
  const record = object(value);
  const start = object(record.start);
  const end = object(record.end);
  if (
    !integer(start.line) ||
    !integer(start.character) ||
    !integer(end.line) ||
    !integer(end.character)
  )
    return;
  return {
    startLineNumber: start.line + 1,
    startColumn: start.character + 1,
    endLineNumber: end.line + 1,
    endColumn: end.character + 1,
  };
}
function tsRange(value: unknown): Monaco.IRange | undefined {
  const record = object(value);
  const start = object(record.start);
  const end = object(record.end);
  if (
    !integer(start.line) ||
    !integer(start.offset) ||
    !integer(end.line) ||
    !integer(end.offset) ||
    start.line < 1 ||
    start.offset < 1 ||
    end.line < 1 ||
    end.offset < 1
  )
    return;
  return {
    startLineNumber: start.line,
    startColumn: start.offset,
    endLineNumber: end.line,
    endColumn: end.offset,
  };
}
function kindOf(kind: unknown, target: unknown, kinds: Options["kinds"]) {
  const lsp = [
    "Text",
    "Method",
    "Function",
    "Constructor",
    "Field",
    "Variable",
    "Class",
    "Interface",
    "Module",
    "Property",
    "Unit",
    "Value",
    "Enum",
    "Keyword",
    "Snippet",
    "Color",
    "File",
    "Reference",
    "Folder",
    "EnumMember",
    "Constant",
    "Struct",
    "Event",
    "Operator",
    "TypeParameter",
  ];
  const ts: Record<string, keyof Options["kinds"]> = {
    method: "Method",
    function: "Function",
    constructor: "Constructor" as const,
    property: "Property",
    var: "Variable",
    let: "Variable",
    const: "Constant",
    class: "Class",
    interface: "Interface",
    module: "Module",
    alias: "Reference",
    enum: "Enum",
    "enum member": "EnumMember",
    keyword: "Keyword",
    type: "TypeParameter",
  };
  const name = target === "vue" && typeof kind === "number" ? lsp[kind - 1] : ts[String(kind)];
  return kinds[name as keyof Options["kinds"]] ?? kinds.Text;
}
function itemOf(raw: Record<string, unknown>, options: Options): VueCompletionItem | null {
  const item = object(raw.item);
  const label = string(item.label) ?? string(item.name);
  if (!label || typeof raw.detailId !== "string") return null;
  const edit = object(item.textEdit);
  const insert = lspRange(edit.insert);
  const replace = lspRange(edit.replace);
  const range =
    insert && replace
      ? { insert, replace }
      : (lspRange(edit.range) ?? tsRange(item.replacementSpan) ?? options.range);
  const result: VueCompletionItem = {
    label,
    kind: kindOf(item.kind, raw.target, options.kinds),
    insertText: string(edit.newText) ?? string(item.insertText) ?? label,
    range,
    vueDetailId: raw.detailId,
    vueSession: options.session,
    vueVersion: options.version,
  };
  // Monaco 的 InsertAsSnippet 是 4；这里仅导入类型，不把编辑器运行时重复打进界面脚本。
  if (item.insertTextFormat === 2 || item.isSnippet === true) result.insertTextRules = 4;
  const sort = string(item.sortText);
  if (sort !== undefined) result.sortText = sort;
  const filter = string(item.filterText);
  if (filter !== undefined) result.filterText = filter;
  const detail = string(item.detail);
  if (detail !== undefined) result.detail = detail;
  if (Array.isArray(item.commitCharacters))
    result.commitCharacters = item.commitCharacters.filter(
      (character): character is string => typeof character === "string",
    );
  return result;
}
export function vueCompletionItems(
  value: unknown,
  options: Options,
): Monaco.languages.CompletionList {
  const data = object(value);
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const suggestions: VueCompletionItem[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const item = itemOf(object(candidate), options);
    if (!item || seen.has(String(item.label))) continue;
    seen.add(String(item.label));
    suggestions.push(item);
  }
  return { suggestions, incomplete: data.incomplete === true };
}
function parts(value: unknown): string {
  return Array.isArray(value) ? value.map((part) => string(object(part).text) ?? "").join("") : "";
}
export function vueCompletionDetails(
  value: unknown,
): Pick<Monaco.languages.CompletionItem, "documentation" | "detail"> {
  const item = object(Array.isArray(value) ? value[0] : value);
  const detail = string(item.detail) ?? (parts(item.displayParts) || undefined);
  const docs =
    string(item.documentation) ??
    string(object(item.documentation).value) ??
    (parts(item.documentation) || undefined);
  return {
    ...(detail ? { detail } : {}),
    ...(docs ? { documentation: { value: docs, isTrusted: false, supportHtml: false } } : {}),
  };
}
