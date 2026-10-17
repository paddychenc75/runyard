import type { Locale } from "@runyard/i18n";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { loadEditorRuntime } from "../../editor/editor-loader.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import type { SessionState } from "./editor-session.ts";
import { editorLanguageOf } from "./file-language.ts";

// 把编辑会话（EditorSession）摆进 Monaco：每个能编辑的文件标签一个模型，选中的那个放进编辑器。
// 只给打开的文件建模型——给项目里每个文件都建会让 TS 线程同步慢到第一次补全等几十秒（K8 证据“装法”第 7 条）。
// 会话是内容的唯一来源：编辑器里的改动经 onEdit 交回会话，会话里的内容和模型不一致时（以后外部修改换内容）以会话为准。

export type EditorTheme = "light" | "dark";

export interface EditorHostHandlers {
  onEdit(path: string, text: string): void;
}

export interface EditorHost {
  sync(state: SessionState, theme: EditorTheme): void;
  focus(): void;
  dispose(): void;
}

export type EditorHostFactory = (
  container: HTMLElement,
  handlers: EditorHostHandlers,
  locale: Locale,
) => Promise<EditorHost>;

/**
 * 项目里没法解析依赖包的类型，“找不到模块”和它的连带误报屏蔽掉（K8 证据“装法”第 6 条；规格 DESKTOP-EDITOR-43）。
 * 前五个是 K8 实测的；后三个（7006、7031、7044：参数隐式 any）是拿真实的 react19 模板过一遍时发现的：
 * `setCount((value) => value + 1)` 因为没有 react 的类型，value 推不出来，开箱就红一条。
 */
export const IGNORED_DIAGNOSTIC_CODES = [2307, 2792, 7016, 7026, 2875, 7006, 7031, 7044];

const configured = new WeakSet<object>();

function configureTypeScript(runtime: EditorRuntime): void {
  if (configured.has(runtime)) return;
  configured.add(runtime);
  const { typescript } = runtime;
  const { typescriptDefaults, javascriptDefaults } = typescript;
  const compilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    noEmit: true,
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    jsx: typescript.JsxEmit.ReactJSX,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
  };
  typescriptDefaults.setCompilerOptions(compilerOptions);
  javascriptDefaults.setCompilerOptions(compilerOptions);
  const diagnostics = { diagnosticCodesToIgnore: IGNORED_DIAGNOSTIC_CODES };
  typescriptDefaults.setDiagnosticsOptions(diagnostics);
  javascriptDefaults.setDiagnosticsOptions(diagnostics);
}

function monoFontFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return value === "" ? "Menlo, monospace" : value;
}

/** 生产用：加载编辑器脚本（预加载过就是现成的）再装配 */
export const createMonacoHost: EditorHostFactory = async (container, handlers, locale) =>
  buildHost(await loadEditorRuntime(document, locale), container, handlers);

export function buildHost(
  runtime: EditorRuntime,
  container: HTMLElement,
  handlers: EditorHostHandlers,
): EditorHost {
  const { monaco } = runtime;
  configureTypeScript(runtime);
  const models = new Map<string, Monaco.editor.ITextModel>();
  const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
  const subscriptions = new Map<string, Monaco.IDisposable>();
  let shownPath: string | null = null;
  const editor = monaco.editor.create(container, {
    model: null,
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: monoFontFamily(),
    fontSize: 13,
    lineHeight: 22,
    scrollBeyondLastLine: false,
    renderLineHighlight: "all",
    padding: { top: 4, bottom: 4 },
    // 设计稿：行号列宽 48、右对齐，行号与代码之间空 16（代码从左边 64 处开始）
    lineNumbersMinChars: 6,
    lineDecorationsWidth: 16,
    guides: { indentation: false, bracketPairs: false },
    bracketPairColorization: { enabled: false },
    occurrencesHighlight: "off",
    glyphMargin: false,
    folding: false,
    overviewRulerLanes: 0,
    scrollbar: { useShadows: false, horizontalScrollbarSize: 8, verticalScrollbarSize: 8 },
  });
  // ⌘S 和 ⌘W 不在这里：它们在整个窗口层面处理（EditorColumn），焦点在不在编辑器里都一样

  const uriOf = (path: string): Monaco.Uri => monaco.Uri.from({ scheme: "file", path: `/${path}` });

  function ensureModel(path: string, tab: SessionState["tabs"][number]): Monaco.editor.ITextModel {
    const existing = models.get(path);
    if (existing !== undefined) return existing;
    const model = monaco.editor.createModel(
      tab.text,
      editorLanguageOf(path, tab.mode),
      uriOf(path),
    );
    // 编辑器选项里的关闭不一定传到模型上（实测括号仍按深度着色），设计稿的括号是标点灰，所以模型上也关
    model.updateOptions({
      bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false },
    });
    if (tab.eol === "crlf") model.setEOL(monaco.editor.EndOfLineSequence.CRLF);
    else if (tab.eol === "lf") model.setEOL(monaco.editor.EndOfLineSequence.LF);
    subscriptions.set(
      path,
      model.onDidChangeContent(() => handlers.onEdit(path, model.getValue())),
    );
    models.set(path, model);
    return model;
  }

  function dropModel(path: string): void {
    subscriptions.get(path)?.dispose();
    subscriptions.delete(path);
    models.get(path)?.dispose();
    models.delete(path);
    viewStates.delete(path);
  }

  function applyLanguageOptions(path: string): void {
    // Vue 只有着色：不从文件里已有的词给建议（规格“智能提示”；K8 装法第 9 条）
    const vue = models.get(path)?.getLanguageId() === "vue";
    editor.updateOptions({
      wordBasedSuggestions: vue ? "off" : "matchingDocuments",
      quickSuggestions: vue ? false : { other: true, comments: false, strings: false },
    });
  }

  return {
    sync(state, theme) {
      monaco.editor.setTheme(runtime.themes[theme]);
      const editable = new Map(
        state.tabs.filter((tab) => tab.view === "text").map((t) => [t.path, t]),
      );
      for (const path of [...models.keys()]) if (!editable.has(path)) dropModel(path);
      for (const [path, tab] of editable) {
        const model = ensureModel(path, tab);
        // 会话是内容的来源：不一致只会是会话里的内容被外部换掉了
        if (model.getValue() !== tab.text) model.setValue(tab.text);
      }
      const next = state.active !== null && editable.has(state.active) ? state.active : null;
      if (next === shownPath) return;
      if (shownPath !== null && models.has(shownPath)) {
        viewStates.set(shownPath, editor.saveViewState());
      }
      shownPath = next;
      editor.setModel(next === null ? null : (models.get(next) ?? null));
      if (next !== null) {
        applyLanguageOptions(next);
        const saved = viewStates.get(next);
        if (saved) editor.restoreViewState(saved);
        editor.focus();
      }
    },
    focus: () => editor.focus(),
    dispose() {
      for (const path of [...models.keys()]) dropModel(path);
      editor.dispose();
    },
  };
}
