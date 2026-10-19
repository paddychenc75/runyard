import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { expect, it } from "vitest";
import { vueCompletionDetails, vueCompletionItems } from "./vue-completion-items.ts";

const kinds = {
  Text: 18,
  Property: 9,
  Variable: 4,
  Function: 1,
} as typeof Monaco.languages.CompletionItemKind;
const range = { startLineNumber: 4, startColumn: 8, endLineNumber: 4, endColumn: 9 };
it("[DESKTOP-EDITOR-80] 属性候选沿用服务器片段和替换范围，重复候选只留一个", () => {
  const result = vueCompletionItems(
    {
      candidates: [
        {
          target: "vue",
          detailId: "a",
          item: {
            label: "title",
            kind: 10,
            insertTextFormat: 2,
            textEdit: {
              newText: 'title="$1"',
              range: { start: { line: 3, character: 7 }, end: { line: 3, character: 8 } },
            },
          },
        },
        { target: "ts", detailId: "b", item: { name: "title", kind: "property" } },
      ],
    },
    { kinds, range, session: "s", version: 1 },
  );
  expect(result.suggestions).toHaveLength(1);
  expect(result.suggestions[0]).toMatchObject({
    label: "title",
    kind: 9,
    insertText: 'title="$1"',
    insertTextRules: 4,
    range,
  });
});
it("脚本候选采用tsserver的真实替换范围与插入文本", () => {
  const result = vueCompletionItems(
    {
      candidates: [
        {
          target: "ts",
          detailId: "t",
          item: {
            name: "watch",
            kind: "function",
            insertText: "watch",
            replacementSpan: { start: { line: 2, offset: 4 }, end: { line: 2, offset: 7 } },
          },
        },
      ],
    },
    { kinds, range, session: "s", version: 1 },
  );
  expect(result.suggestions[0]).toMatchObject({
    label: "watch",
    kind: 1,
    range: { startLineNumber: 2, startColumn: 4, endLineNumber: 2, endColumn: 7 },
  });
});
it("详情只作不可信文档展示，不执行服务器附带命令", () => {
  const detail = vueCompletionDetails({
    documentation: { kind: "markdown", value: "[x](command:run)" },
    command: { command: "run" },
  });
  expect(detail).toEqual({
    documentation: { value: "[x](command:run)", isTrusted: false, supportHtml: false },
  });
});
