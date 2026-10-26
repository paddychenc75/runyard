import type * as Monaco from "monaco-editor/editor/editor.api.js";

export function monoFontFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return value === "" ? "Menlo, monospace" : value;
}

/** 按当前显示的文件换编辑器选项：Vue 只采用语言服务的候选，不把文件里的词混进真实类型补全 */
export function applyLanguageOptions(
  editor: Monaco.editor.IStandaloneCodeEditor,
  model: Monaco.editor.ITextModel | undefined,
): void {
  const vue = model?.getLanguageId() === "vue";
  editor.updateOptions({
    wordBasedSuggestions: vue ? "off" : "matchingDocuments",
    quickSuggestions: { other: true, comments: false, strings: vue },
  });
}
