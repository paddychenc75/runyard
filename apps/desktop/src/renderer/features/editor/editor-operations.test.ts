import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { expect, it, vi } from "vitest";
import { runEditorOperation } from "./editor-operations.ts";

it("[DESKTOP-EDITOR-85] 跳转是Monaco全局命令，getAction没有它也必须触发", () => {
  const trigger = vi.fn();
  const editor = {
    focus: vi.fn(),
    getAction: () => null,
    trigger,
  } as unknown as Monaco.editor.IStandaloneCodeEditor;
  runEditorOperation(editor, "goToDefinition");
  expect(trigger).toHaveBeenCalledWith("runyard", "editor.action.revealDefinition", {});
});
