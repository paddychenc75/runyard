import { createEditorRuntime } from "./runtime.ts";
import { RUNTIME_GLOBAL } from "./runtime-types.ts";

// 编辑器脚本的入口（构建成 dist/renderer/editor/editor.js，和主脚本分开，应用启动后空闲时才加载）。
// 把初始化好的运行时的 Promise 挂到全局名下，由 editor-loader.ts 取走。
(globalThis as Record<string, unknown>)[RUNTIME_GLOBAL] = createEditorRuntime();
