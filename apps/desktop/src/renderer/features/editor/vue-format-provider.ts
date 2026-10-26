import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { vueRange, vueRecord } from "./vue-inspection-items.ts";
import { type VueModelRequestInput, VueModelRequests } from "./vue-model-requests.ts";

interface Input extends VueModelRequestInput {
  runtime: EditorRuntime;
}

/** 把官方语言服务返回的文本修改（LSP TextEdit）转成 Monaco 的；形状不对的丢掉，不让一条坏数据毁掉整份文档 */
export function vueFormattingEdits(value: unknown): Monaco.languages.TextEdit[] {
  if (!Array.isArray(value)) return [];
  const edits: Monaco.languages.TextEdit[] = [];
  for (const item of value) {
    const record = vueRecord(item);
    const range = vueRange(record.range);
    if (range && typeof record.newText === "string") edits.push({ range, text: record.newText });
  }
  return edits;
}

/** Vue 文件的“格式化文档”：整份文档交给官方语言服务，缩进跟着编辑器此刻对这个文件的设置 */
export function registerVueFormatting(input: Input): Monaco.IDisposable {
  const requests = new VueModelRequests(input);
  const registration = input.runtime.monaco.languages.registerDocumentFormattingEditProvider(
    "vue",
    {
      displayName: "Vue",
      async provideDocumentFormattingEdits(model, options, token) {
        const origin = requests.origin(model);
        if (!origin) return [];
        const value = await requests.request(origin, token, "formatting", undefined, undefined, {
          tabSize: options.tabSize,
          insertSpaces: options.insertSpaces,
        });
        // 请求期间文档又变了：旧的修改套不到新文本上，宁可什么都不做
        return requests.current(origin) ? vueFormattingEdits(value) : [];
      },
    },
  );
  return {
    dispose() {
      requests.dispose();
      registration.dispose();
    },
  };
}
