import type { Locale } from "@runyard/i18n";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { loadEditorRuntime } from "../../editor/editor-loader.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { type EditorOperation, runEditorOperation } from "./editor-operations.ts";
import { editorLanguageOf } from "./file-language.ts";
import type { FileTab } from "./file-tab.ts";
import { scrollbarOptions } from "./monaco-scrollbar-options.ts";
import { widgetOptions } from "./monaco-widget-options.ts";
import type { ProjectSource } from "./project-source.ts";
import type { SessionState } from "./session-types.ts";
import { configureTypeScript, IGNORED_DIAGNOSTIC_CODES } from "./typescript-defaults.ts";
import { TypeScriptDiagnostics } from "./typescript-diagnostics.ts";
import { type ClosedFile, TypeScriptProject } from "./typescript-project.ts";
import { registerVueCompletion } from "./vue-completion-provider.ts";
import { VueModelSync } from "./vue-model-sync.ts";

// 把编辑会话（EditorSession）摆进 Monaco：每个能编辑的文件标签一个模型，选中的那个放进编辑器。
// 只给打开的文件建模型——给项目里每个文件都建会让 TS 线程同步慢到第一次补全等几十秒（K8 证据“装法”第 7 条）。
// 会话是内容的唯一来源：编辑器里的改动经 onEdit 交回会话，会话里的内容和模型不一致时（以后外部修改换内容）以会话为准。

export type EditorTheme = "light" | "dark";

export interface EditorHostHandlers {
  onEdit(path: string, text: string): void;
  /** 跳转到定义、改名等落在别的文件上：打开（或切到）那个文件的标签，光标放在 at（DESKTOP-EDITOR-41） */
  onOpenFile?(path: string, at: Monaco.IPosition | undefined): void;
  /** 改名一类的操作改到了没打开的文件：让会话为它开标签、带上改后的内容并照常保存 */
  onStrayEdit?(path: string, text: string): void;
  /** 输入法正在组词（拼音还没选定）或结束：组词期间不该自动保存，免得把半截拼音写进磁盘（#310） */
  onComposing?(path: string, composing: boolean): void;
  /** 会话换进来的内容被 Monaco 规范化后和会话里的不一样（比如单独的 \r 换行）：这不是用户的编辑，会话把它当作已保存的内容采用，不写盘 */
  onNormalized?(path: string, text: string): void;
}

export type { EditorOperation };

export interface EditorHost {
  sync(state: SessionState, theme: EditorTheme): void;
  focus(): void;
  /** 在当前显示的文件上做一个编辑器操作（先把焦点放回编辑器）；这个文件上做不了就什么都不做 */
  run(operation: EditorOperation): void;
  dispose(): void;
}

export type EditorHostFactory = (
  container: HTMLElement,
  handlers: EditorHostHandlers,
  locale: Locale,
  /** 项目文件的来源：有它才有跨文件的智能提示 */
  source?: ProjectSource,
) => Promise<EditorHost>;

/**
 * 每个路径的模型用过的最大版本号（同一个运行时里所有项目共用）。语言服务按“路径加版本号”缓存：
 * 关掉的文件再打开、或者换到另一个项目里同一个相对路径的文件，新模型从版本 1 开始，
 * 撞上缓存里的 1 就拿到旧项目的类型，所以新模型的版本号一律抬到用过的最大值之上。
 */
const usedVersions = new WeakMap<object, Map<string, number>>();

function monoFontFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return value === "" ? "Menlo, monospace" : value;
}

/** 生产用：加载编辑器脚本（预加载过就是现成的）再装配 */
export const createMonacoHost: EditorHostFactory = async (container, handlers, locale, source) =>
  buildHost(await loadEditorRuntime(document, locale), container, handlers, source);

/** 跳转后等着摆光标的位置，过了这么久还没等到那个文件显示出来就作废（文件没打开成功） */
const REVEAL_EXPIRES_MS = 5000;

export function buildHost(
  runtime: EditorRuntime,
  container: HTMLElement,
  handlers: EditorHostHandlers,
  source?: ProjectSource,
): EditorHost {
  const { monaco } = runtime;
  configureTypeScript(runtime);
  const vue = source?.vue ? new VueModelSync(source.vue) : undefined;
  // 以文件标签的 id（不随改名变）为键：改名后 Monaco 的模型地址改不了，要用同样的内容另建一个模型接管，
  // 光标和滚动位置按 id 带过去（规格 DESKTOP-EDITOR-09、10；K8 证据“没有验证的”一栏）
  interface Entry {
    path: string;
    model: Monaco.editor.ITextModel;
    subscription: Monaco.IDisposable;
  }
  const entries = new Map<string, Entry>();
  const completion =
    source?.vue && vue
      ? registerVueCompletion({
          runtime,
          bridge: source.vue,
          owns: (model) => [...entries.values()].some((entry) => entry.model === model),
          synced: (model) => vue.synced(model),
        })
      : undefined;
  const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
  const versions = usedVersions.get(runtime) ?? new Map<string, number>();
  usedVersions.set(runtime, versions);
  const remember = (model: Monaco.editor.ITextModel): void => {
    const key = model.uri.toString();
    versions.set(key, Math.max(versions.get(key) ?? 0, model.getVersionId()));
  };
  let shownId: string | null = null;
  let reveal: { path: string; at: Monaco.IPosition; until: number } | null = null;
  let creatingOwn = false;
  /** 会话换内容（setValue）期间模型的变化不是用户的编辑，不能交回会话，否则静默重载会变成一次保存 */
  let applyingSession = false;
  let appliedTheme: EditorTheme | null = null;
  /** 没打开的项目文件被语言服务临时建了模型（跳转预览、查找引用、改名）：记下来，改了就交给会话，没改就清掉 */
  const strays = new Map<Monaco.editor.ITextModel, { edited: boolean }>();
  const diagnostics = new TypeScriptDiagnostics({
    runtime,
    models: () => [...entries.values()].map((entry) => entry.model),
    ignoredCodes: IGNORED_DIAGNOSTIC_CODES,
  });
  const project =
    source === undefined
      ? undefined
      : new TypeScriptProject({
          runtime,
          source,
          onLibsChanged: () => {
            sweepStrays();
            diagnostics.schedule();
          },
        });
  void project?.start();
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
    scrollbar: scrollbarOptions,
    ...widgetOptions,
  });
  // 输入法组词时模型里已经是没选定的拼音，会话据此暂缓自动保存（#310）
  const composing = [true, false].map((on) =>
    (on ? editor.onDidCompositionStart : editor.onDidCompositionEnd)(() => {
      const path = shownId === null ? undefined : entries.get(shownId)?.path;
      if (path !== undefined) handlers.onComposing?.(path, on);
    }),
  );
  // ⌘S 和 ⌘W 不在这里：它们在整个窗口层面处理（EditorColumn），焦点在不在编辑器里都一样

  const uriOf = (path: string): Monaco.Uri => monaco.Uri.from({ scheme: "file", path: `/${path}` });

  function sweepStrays(): void {
    for (const [model, info] of [...strays]) {
      if (model.isDisposed()) strays.delete(model);
      else if (!info.edited) {
        strays.delete(model);
        remember(model);
        model.dispose();
      }
    }
  }

  const createdListener = monaco.editor.onDidCreateModel((model) => {
    if (creatingOwn || model.uri.scheme !== "file") return;
    if (project === undefined || !project.isKnownScript(model.uri.path.slice(1))) return;
    const info = { edited: false };
    strays.set(model, info);
    const path = model.uri.path.slice(1);
    const subscription = model.onDidChangeContent(() => {
      info.edited = true;
      subscription.dispose();
      handlers.onStrayEdit?.(path, model.getValue());
    });
    model.onWillDispose(() => {
      subscription.dispose();
      strays.delete(model);
    });
  });

  // 跳转到定义：目标在别的文件就打开（或切到）它的标签；同一个文件由 Monaco 自己摆光标
  const opener = monaco.editor.registerEditorOpener({
    openCodeEditor(from, resource, selectionOrPosition) {
      if (from !== editor || resource.scheme !== "file") return false;
      if (editor.getModel()?.uri.toString() === resource.toString()) return false;
      if (handlers.onOpenFile === undefined) return false;
      const path = resource.path.slice(1);
      if (project?.isKnownScript(path) !== true && !isOpenPath(path)) return false;
      const at =
        selectionOrPosition === undefined
          ? undefined
          : "startLineNumber" in selectionOrPosition
            ? {
                lineNumber: selectionOrPosition.startLineNumber,
                column: selectionOrPosition.startColumn,
              }
            : selectionOrPosition;
      if (at !== undefined) reveal = { path, at, until: Date.now() + REVEAL_EXPIRES_MS };
      handlers.onOpenFile(path, at);
      return true;
    },
  });

  function isOpenPath(path: string): boolean {
    return [...entries.values()].some((entry) => entry.path === path);
  }

  /**
   * 模型的版本号要比同一路径上 extra lib 的大：语言服务按“路径加版本号”缓存，两边都是 1 的话
   * 它认为文件没变，类型还是旧的（K8 证据“装法”第 7 条）。用一次加字符、删字符的编辑把版本号抬上去，内容不变。
   */
  function raiseVersionAboveLib(model: Monaco.editor.ITextModel, path: string): void {
    const floor = Math.max(project?.libVersion(path) ?? 0, versions.get(model.uri.toString()) ?? 0);
    if (floor === 0) return;
    const origin = new monaco.Range(1, 1, 1, 1);
    while (model.getVersionId() <= floor) {
      model.applyEdits([{ range: origin, text: " " }]);
      model.applyEdits([{ range: new monaco.Range(1, 1, 1, 2), text: "" }]);
    }
  }

  function createEntry(tab: FileTab): Entry {
    // 同一个地址已有模型（语言服务为预览临时建的、没打开的文件）：让位给标签自己的
    const taken = monaco.editor.getModel(uriOf(tab.path));
    if (taken !== null) {
      remember(taken);
      taken.dispose();
    }
    creatingOwn = true;
    const model = monaco.editor.createModel(
      tab.text,
      editorLanguageOf(tab.path, tab.mode),
      uriOf(tab.path),
    );
    creatingOwn = false;
    raiseVersionAboveLib(model, tab.path);
    // 编辑器选项里的关闭不一定传到模型上（实测括号仍按深度着色），设计稿的括号是标点灰，所以模型上也关
    model.updateOptions({
      bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false },
    });
    if (tab.eol === "crlf") model.setEOL(monaco.editor.EndOfLineSequence.CRLF);
    else if (tab.eol === "lf") model.setEOL(monaco.editor.EndOfLineSequence.LF);
    vue?.attach(tab.path, model);
    const entry: Entry = {
      path: tab.path,
      model,
      // 路径取调用时的，改名后会话里已是新路径
      subscription: model.onDidChangeContent(() => {
        if (applyingSession) return;
        handlers.onEdit(entry.path, model.getValue());
        diagnostics.schedule();
      }),
    };
    return entry;
  }

  function replaceText(model: Monaco.editor.ITextModel, tab: FileTab, shown: boolean): void {
    const position = shown ? editor.getPosition() : null;
    const scroll = shown ? { top: editor.getScrollTop(), left: editor.getScrollLeft() } : null;
    applyingSession = true;
    try {
      model.setValue(tab.text);
      if (tab.eol === "crlf") model.setEOL(monaco.editor.EndOfLineSequence.CRLF);
      else if (tab.eol === "lf") model.setEOL(monaco.editor.EndOfLineSequence.LF);
    } finally {
      applyingSession = false;
    }
    if (position !== null) editor.setPosition(model.validatePosition(position));
    if (scroll !== null)
      editor.setScrollPosition({ scrollTop: scroll.top, scrollLeft: scroll.left });
    // Monaco 规范化了内容（单独的 \r 当换行等）：交给会话采用，两边一致就不会反复重载
    const actual = model.getValue();
    if (actual !== tab.text) handlers.onNormalized?.(tab.path, actual);
  }

  function disposeEntry(entry: Entry): void {
    remember(entry.model);
    entry.subscription.dispose();
    entry.model.dispose();
  }

  function applyLanguageOptions(id: string): void {
    // Vue 只采用语言服务的候选，不把文件里的词混进真实类型补全。
    const vue = entries.get(id)?.model.getLanguageId() === "vue";
    editor.updateOptions({
      wordBasedSuggestions: vue ? "off" : "matchingDocuments",
      quickSuggestions: { other: true, comments: false, strings: vue },
    });
  }

  return {
    sync(state, theme) {
      if (appliedTheme !== theme) {
        monaco.editor.setTheme(runtime.themes[theme]);
        appliedTheme = theme;
      }
      const editable = new Map(
        state.tabs.filter((tab) => tab.view === "text").map((tab) => [tab.id, tab]),
      );
      const closed = new Map<string, ClosedFile>();
      for (const [id, entry] of [...entries]) {
        if (!editable.has(id)) {
          closed.set(entry.path, {
            text: entry.model.getValue(),
            version: entry.model.getVersionId(),
          });
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
      project?.setOpen(new Set([...entries.values()].map((entry) => entry.path)), closed);
      diagnostics.schedule();
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
        const wanted = reveal;
        reveal = null;
        if (
          wanted !== null &&
          wanted.path === entries.get(next)?.path &&
          Date.now() < wanted.until
        ) {
          editor.setPosition(wanted.at);
          editor.revealPositionInCenter(wanted.at, monaco.editor.ScrollType.Immediate);
        }
        editor.focus();
      }
    },
    focus: () => editor.focus(),
    run: (operation) => runEditorOperation(editor, operation),
    dispose() {
      completion?.dispose();
      opener.dispose();
      createdListener.dispose();
      for (const listener of composing) listener.dispose();
      project?.dispose();
      diagnostics.dispose();
      for (const model of strays.keys()) {
        if (model.isDisposed()) continue;
        remember(model);
        model.dispose();
      }
      strays.clear();
      for (const entry of entries.values()) disposeEntry(entry);
      entries.clear();
      editor.dispose();
    },
  };
}
