import type * as Monaco from "monaco-editor/editor/editor.api.js";

/** 命令面板能触发的编辑器操作（规格“命令面板”的编辑器命令），对应 Monaco 的内置操作 */
export type EditorOperation =
  | "find"
  | "replace"
  | "goToLine"
  | "goToDefinition"
  | "renameSymbol"
  | "toggleComment"
  | "foldAll"
  | "unfoldAll"
  | "selectAllOccurrences";

const MONACO_ACTIONS: Record<EditorOperation, string> = {
  find: "actions.find",
  replace: "editor.action.startFindReplace",
  goToLine: "editor.action.gotoLine",
  goToDefinition: "editor.action.revealDefinition",
  renameSymbol: "editor.action.rename",
  toggleComment: "editor.action.commentLine",
  foldAll: "editor.foldAll",
  unfoldAll: "editor.unfoldAll",
  selectAllOccurrences: "editor.action.selectHighlights",
};

/** 在编辑器里做一个操作：先把焦点放回编辑器；这个文件（语言）上没有这个操作就什么都不做 */
export function runEditorOperation(
  editor: Monaco.editor.IStandaloneCodeEditor,
  operation: EditorOperation,
): void {
  editor.focus();
  // 折叠默认是关的（设计稿的代码区左边没有折叠箭头）；用到“折叠全部、展开全部”时才打开，箭头只在鼠标移上去时出现
  if (operation === "foldAll" || operation === "unfoldAll") {
    editor.updateOptions({ folding: true, showFoldingControls: "mouseover" });
  }
  // Monaco 的跳转注册为全局 EditorAction2，不在 getAction 的实例动作表里。
  if (operation === "goToDefinition") editor.trigger("runyard", MONACO_ACTIONS[operation], {});
  else void editor.getAction(MONACO_ACTIONS[operation])?.run();
}
