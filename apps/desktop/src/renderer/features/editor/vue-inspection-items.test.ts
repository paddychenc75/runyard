import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { expect, it } from "vitest";
import { vueDiagnosticMarkers, vueHover } from "./vue-inspection-items.ts";

const severity = { Error: 8, Warning: 4, Info: 2, Hint: 1 } as typeof Monaco.MarkerSeverity;
it("[DESKTOP-EDITOR-87] 屏蔽找不到模块，仍显示自己的类型错误", () => {
  const entries = [2307, 2792, 2322].map((code) => ({
    code,
    category: "error",
    text: "diagnostic",
    start: { line: 1, offset: 2 },
    end: { line: 1, offset: 4 },
  }));
  const markers = vueDiagnosticMarkers({ vue: [], syntax: [], semantic: entries }, severity);
  expect(markers.map((item) => item.code)).toEqual(["2322"]);
  expect(markers[0]).toMatchObject({
    startLineNumber: 1,
    startColumn: 2,
    endLineNumber: 1,
    endColumn: 4,
    severity: 8,
  });
});
it("[DESKTOP-EDITOR-84] 悬停显示真实属性类型且不信任Markdown命令", () => {
  const hover = vueHover({
    ts: {
      displayString: "(property) title: string",
      start: { line: 2, offset: 4 },
      end: { line: 2, offset: 9 },
    },
    vue: null,
  });
  expect(hover?.contents[0]).toMatchObject({
    value: expect.stringContaining("title: string"),
    isTrusted: false,
    supportHtml: false,
  });
});
it("两套服务器同范围同代码诊断合并，不重复画两条", () => {
  const result = vueDiagnosticMarkers(
    {
      syntax: [],
      semantic: [
        {
          code: 2322,
          text: "Type mismatch",
          category: "error",
          start: { line: 1, offset: 1 },
          end: { line: 1, offset: 2 },
        },
      ],
      vue: [
        {
          code: 2322,
          message: "Type mismatch",
          severity: 1,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
    },
    severity,
  );
  expect(result).toHaveLength(1);
});
