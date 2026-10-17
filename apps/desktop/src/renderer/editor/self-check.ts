import type { EditorRuntime } from "./runtime-types.ts";

// 编辑器自检（冒烟用，不是界面）：证明 Monaco、一个后台线程、Shiki 都在带新内容安全策略的页面里真的起来了。

export interface EditorSelfCheck {
  /** TS 后台线程能起来，并报出故意写错的那行的语法错误个数 */
  tsWorkerSyntaxErrors: number;
  /** Shiki 给 Vue 单文件组件分出的不同记号种类数（Monaco 自带的着色器不认识 Vue，单色就是 1） */
  vueTokenKinds: number;
  /** 创建出的编辑器能放进页面并显示行 */
  editorRendered: boolean;
}

const VUE_SAMPLE = `<template>\n  <button class="btn">{{ count }}</button>\n</template>\n<script setup lang="ts">\nconst count: number = 1\n</script>\n<style scoped>\n.btn { color: red }\n</style>\n`;

export async function runEditorSelfCheck(
  runtime: EditorRuntime,
  host: HTMLElement,
): Promise<EditorSelfCheck> {
  const { monaco, typescript } = runtime;
  // 1. TS 后台线程（从 app://runyard/workers/ts.worker.js 加载）
  const uri = monaco.Uri.parse("file:///selfcheck/broken.ts");
  const model = monaco.editor.createModel("const = ;", "typescript", uri);
  const getWorker = await typescript.getTypeScriptWorker();
  const client = await getWorker(uri);
  const syntax = await client.getSyntacticDiagnostics(uri.toString());
  // 2. Shiki：Vue 三段分别着色
  const kinds = new Set<string>();
  for (const line of monaco.editor.tokenize(VUE_SAMPLE, "vue"))
    for (const token of line) kinds.add(token.type);
  // 3. 编辑器本体（用到编辑器后台线程、codicon 字体、行渲染的内联样式）
  host.style.cssText = "position:fixed;left:0;top:0;width:480px;height:240px";
  monaco.editor.setTheme(runtime.themes.light);
  const editor = monaco.editor.create(host, { model, automaticLayout: false });
  editor.layout({ width: 480, height: 240 });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const editorRendered = host.querySelectorAll(".view-line").length > 0;
  editor.dispose();
  model.dispose();
  return {
    tsWorkerSyntaxErrors: syntax.length,
    vueTokenKinds: kinds.size,
    editorRendered,
  };
}
