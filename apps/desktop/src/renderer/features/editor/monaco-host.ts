import type { Locale } from "@runyard/i18n";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { loadEditorRuntime } from "../../editor/editor-loader.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { editorLanguageOf } from "./file-language.ts";
import type { FileTab } from "./file-tab.ts";
import type { SessionState } from "./session-types.ts";

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
  // 以文件标签的 id（不随改名变）为键：改名后 Monaco 的模型地址改不了，要用同样的内容另建一个模型接管，
  // 光标和滚动位置按 id 带过去（规格 DESKTOP-EDITOR-09、10；K8 证据“没有验证的”一栏）
  interface Entry {
    path: string;
    model: Monaco.editor.ITextModel;
    subscription: Monaco.IDisposable;
  }
  const entries = new Map<string, Entry>();
  const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
  let shownId: string | null = null;
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

  function createEntry(tab: FileTab): Entry {
    const model = monaco.editor.createModel(
      tab.text,
      editorLanguageOf(tab.path, tab.mode),
      uriOf(tab.path),
    );
    // 编辑器选项里的关闭不一定传到模型上（实测括号仍按深度着色），设计稿的括号是标点灰，所以模型上也关
    model.updateOptions({
      bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false },
    });
    if (tab.eol === "crlf") model.setEOL(monaco.editor.EndOfLineSequence.CRLF);
    else if (tab.eol === "lf") model.setEOL(monaco.editor.EndOfLineSequence.LF);
    const entry: Entry = {
      path: tab.path,
      model,
      // 路径取调用时的，改名后会话里已是新路径
      subscription: model.onDidChangeContent(() => handlers.onEdit(entry.path, model.getValue())),
    };
    return entry;
  }

  function replaceText(model: Monaco.editor.ITextModel, tab: FileTab, shown: boolean): void {
    const position = shown ? editor.getPosition() : null;
    model.setValue(tab.text);
    if (tab.eol === "crlf") model.setEOL(monaco.editor.EndOfLineSequence.CRLF);
    else if (tab.eol === "lf") model.setEOL(monaco.editor.EndOfLineSequence.LF);
    if (position !== null) editor.setPosition(model.validatePosition(position));
  }

  function disposeEntry(entry: Entry): void {
    entry.subscription.dispose();
    entry.model.dispose();
  }

  function applyLanguageOptions(id: string): void {
    // Vue 只有着色：不从文件里已有的词给建议（规格“智能提示”；K8 装法第 9 条）
    const vue = entries.get(id)?.model.getLanguageId() === "vue";
    editor.updateOptions({
      wordBasedSuggestions: vue ? "off" : "matchingDocuments",
      quickSuggestions: vue ? false : { other: true, comments: false, strings: false },
    });
  }

  return {
    sync(state, theme) {
      monaco.editor.setTheme(runtime.themes[theme]);
      const editable = new Map(
        state.tabs.filter((tab) => tab.view === "text").map((tab) => [tab.id, tab]),
      );
      for (const [id, entry] of [...entries]) {
        if (!editable.has(id)) {
          disposeEntry(entry);
          entries.delete(id);
          viewStates.delete(id);
        }
      }
      for (const [id, tab] of editable) {
        const existing = entries.get(id);
        if (existing !== undefined && existing.path !== tab.path) {
          // 改名：先存下光标位置，换新模型后再放回去
          if (shownId === id) viewStates.set(id, editor.saveViewState());
          disposeEntry(existing);
          entries.delete(id);
          if (shownId === id) shownId = null;
        }
        let entry = entries.get(id);
        if (entry === undefined) {
          entry = createEntry(tab);
          entries.set(id, entry);
        }
        // 会话是内容的来源：不一致只会是会话里的内容被外部换掉了。换内容时光标留在原来的行和列，
        // 超出新内容就放在最后（DESKTOP-EDITOR-31）
        if (entry.model.getValue() !== tab.text) replaceText(entry.model, tab, id === shownId);
      }
      const activeTab = state.tabs.find((tab) => tab.path === state.active);
      const next = activeTab !== undefined && editable.has(activeTab.id) ? activeTab.id : null;
      if (next === shownId) return;
      if (shownId !== null && entries.has(shownId)) {
        viewStates.set(shownId, editor.saveViewState());
      }
      shownId = next;
      editor.setModel(next === null ? null : (entries.get(next)?.model ?? null));
      if (next !== null) {
        applyLanguageOptions(next);
        const saved = viewStates.get(next);
        if (saved) editor.restoreViewState(saved);
        editor.focus();
      }
    },
    focus: () => editor.focus(),
    dispose() {
      for (const entry of entries.values()) disposeEntry(entry);
      entries.clear();
      editor.dispose();
    },
  };
}
