import type { Page } from "@playwright/test";
import type { editor, Selection } from "monaco-editor";

interface ProofWindow extends Window {
  __runyardEditorRuntime: Promise<{ monaco: typeof import("monaco-editor") }>;
  settingsProof?: { editor: editor.ICodeEditor; model: editor.ITextModel; selection: Selection };
}

/** 保存真实对象引用，返回时不仅比对文字，也验证没有重建模型与编辑器。 */
export async function rememberEditor(page: Page) {
  return page.evaluate(async () => {
    const state = window as unknown as ProofWindow;
    const runtime = await state.__runyardEditorRuntime;
    const editor = runtime.monaco.editor.getEditors()[0];
    const model = editor?.getModel();
    if (!editor || !model) throw new Error("编辑器尚未就绪");
    editor.setPosition({ lineNumber: 1, column: 8 });
    const selection = editor.getSelection();
    if (!selection) throw new Error("编辑器没有选择位置");
    state.settingsProof = { editor, model, selection };
    return model.getValue();
  });
}

export async function editorProof(page: Page) {
  return page.evaluate(async () => {
    const state = window as unknown as ProofWindow;
    const runtime = await state.__runyardEditorRuntime;
    const editor = runtime.monaco.editor.getEditors()[0];
    const saved = state.settingsProof;
    if (!saved || !editor) throw new Error("编辑器身份记录缺失");
    return {
      sameEditor: editor === saved.editor,
      sameModel: editor.getModel() === saved.model,
      sameSelection: editor.getSelection()?.equalsSelection(saved.selection),
      text: editor.getValue(),
      focused: editor.hasTextFocus(),
    };
  });
}
