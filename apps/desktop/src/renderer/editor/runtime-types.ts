import type * as Monaco from "monaco-editor/editor/editor.api.js";
import type * as MonacoTs from "monaco-editor/languages/features/typescript/register.js";

import type { EditorMenu } from "./runtime-menu.ts";

// 编辑器运行时的对外形状。主界面的脚本只拿类型（import type，不带进主脚本），
// 真正的 Monaco 在单独的 editor/editor.js 里，由 editor-loader.ts 按需或预加载。

export interface EditorRuntime {
  monaco: typeof Monaco;
  /** TS/JS 语言服务（不在 monaco.languages.typescript 上，要从 features/typescript/register 取） */
  typescript: typeof MonacoTs;
  /** 右键菜单的内部登记表（必须与 Monaco 同一份脚本，见 runtime-menu.ts） */
  menu: EditorMenu;
  /** Shiki 注册的主题名，随应用明暗切换（setTheme） */
  themes: { light: string; dark: string };
}

/** 单独的编辑器脚本把运行时挂在这个全局名下，加载器读它 */
export const RUNTIME_GLOBAL = "__runyardEditorRuntime";

/** 脚本、样式、后台线程文件的位置（都在 app://runyard/ 下，不走网络） */
export const EDITOR_SCRIPT_URL = "app://runyard/editor/editor.js";
export const EDITOR_STYLE_URL = "app://runyard/editor/editor.css";
export const WORKER_BASE_URL = "app://runyard/workers/";

/** Monaco 的中文界面文字（查找框、操作名）。必须在编辑器脚本之前加载，英文界面不加载 */
export const EDITOR_NLS_ZH_SCRIPT_URL = "app://runyard/editor/nls-zh-cn.js";
