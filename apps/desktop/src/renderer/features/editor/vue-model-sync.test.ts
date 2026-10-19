import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { describe, expect, it, vi } from "vitest";
import type { VueDocumentBridge } from "../../bridge/vue-language.ts";
import { VueModelSync } from "./vue-model-sync.ts";

describe("Vue 模型文档同步", () => {
  it("打开、内容变化、销毁按序同步，服务失败不抛进编辑回调", async () => {
    let change = () => {};
    let dispose = () => {};
    let text = "first";
    let version = 1;
    const model = {
      getLanguageId: () => "vue",
      getValue: () => text,
      getVersionId: () => version,
      onDidChangeContent: (listener: () => void) => {
        change = listener;
        return { dispose() {} };
      },
      onWillDispose: (listener: () => void) => {
        dispose = listener;
        return { dispose() {} };
      },
    } as unknown as Monaco.editor.ITextModel;
    const calls: unknown[] = [];
    const bridge = {
      open: async (...args: unknown[]) => {
        calls.push(args);
        throw new Error("not ready");
      },
      sync: async (...args: unknown[]) => {
        calls.push(args);
        if (args[2] === 1) throw new Error("not ready");
      },
      close: async (path: string) => {
        calls.push(["closed", path]);
      },
    } as unknown as VueDocumentBridge;
    new VueModelSync(bridge).attach("Use.vue", model);
    text = "unsaved";
    version = 2;
    expect(() => change()).not.toThrow();
    dispose();
    await vi.waitFor(() =>
      expect(calls).toEqual([
        ["Use.vue", "first", 1, expect.any(String)],
        ["Use.vue", "unsaved", 2, expect.any(String)],
        ["closed", "Use.vue"],
      ]),
    );
  });
  it("普通 TypeScript 和已关闭高亮的大文件不会启动 Vue 服务", () => {
    const sync = vi.fn();
    const bridge = { sync } as unknown as VueDocumentBridge;
    const models = new VueModelSync(bridge);
    for (const language of ["typescript", "plaintext"])
      models.attach("Use.vue", { getLanguageId: () => language } as Monaco.editor.ITextModel);
    expect(sync).not.toHaveBeenCalled();
  });
});
