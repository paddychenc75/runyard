import type { Locale } from "@runyard/i18n";
import {
  EDITOR_NLS_ZH_SCRIPT_URL,
  EDITOR_SCRIPT_URL,
  EDITOR_STYLE_URL,
  type EditorRuntime,
  RUNTIME_GLOBAL,
} from "./runtime-types.ts";

// 加载单独的编辑器脚本和样式（约 5 MB，不进主脚本）。重复调用共用同一次加载；失败后下次调用重试。
// 脚本和样式都来自 app://runyard/，符合内容安全策略的 script-src、style-src。

let loading: Promise<EditorRuntime> | undefined;

function appendScript(doc: Document, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = src;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error(`editor script failed to load: ${src}`)),
    );
    doc.head.append(script);
  });
}

function appendStyle(doc: Document): void {
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = EDITOR_STYLE_URL;
  doc.head.append(link);
}

// 中文界面：Monaco 在载入时就取好界面文字，所以中文文字包要先于编辑器脚本载入（K8 证据“装法”第 11 条）；
// 语言以第一次调用为准，运行中切换语言要重新加载界面。
export function loadEditorRuntime(
  doc: Document = document,
  locale?: Locale,
): Promise<EditorRuntime> {
  if (loading !== undefined) return loading;
  const attempt = (async () => {
    appendStyle(doc);
    if (locale === "zh-CN") await appendScript(doc, EDITOR_NLS_ZH_SCRIPT_URL);
    await appendScript(doc, EDITOR_SCRIPT_URL);
    const pending = (doc.defaultView as unknown as Record<string, unknown> | null)?.[
      RUNTIME_GLOBAL
    ];
    if (pending === undefined) throw new Error("editor script did not provide a runtime");
    return await (pending as Promise<EditorRuntime>);
  })();
  loading = attempt;
  attempt.catch(() => {
    if (loading === attempt) loading = undefined;
  });
  return attempt;
}

/** 应用启动后空闲时预加载，让第一次打开文件时编辑器已经就绪（规格 desktop/editor 场景 04 的 150 ms 目标，负责人决定预加载，K8） */
export function preloadEditorWhenIdle(
  win: Window = window,
  doc: Document = document,
  locale?: Locale,
): void {
  const start = (): void => {
    loadEditorRuntime(doc, locale).catch((error: unknown) => {
      // 预加载失败不打扰界面；真正打开编辑器时 loadEditorRuntime 会重试并把错误交给调用方
      console.error("editor preload failed", error);
    });
  };
  if (typeof win.requestIdleCallback === "function") win.requestIdleCallback(start);
  else win.setTimeout(start, 0);
}
