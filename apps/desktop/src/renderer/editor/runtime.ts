import "./monaco-features.ts";
import { shikiToMonaco } from "@shikijs/monaco";
import * as monaco from "monaco-editor/editor/editor.api.js";
import * as typescript from "monaco-editor/languages/features/typescript/register.js";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import langCss from "shiki/langs/css.mjs";
import langGo from "shiki/langs/go.mjs";
import langHtml from "shiki/langs/html.mjs";
import langJavascript from "shiki/langs/javascript.mjs";
import langJson from "shiki/langs/json.mjs";
import langJsx from "shiki/langs/jsx.mjs";
import langMarkdown from "shiki/langs/markdown.mjs";
import langPython from "shiki/langs/python.mjs";
import langTsx from "shiki/langs/tsx.mjs";
import langTypescript from "shiki/langs/typescript.mjs";
import langVue from "shiki/langs/vue.mjs";
import themeDark from "shiki/themes/github-dark.mjs";
import themeLight from "shiki/themes/github-light.mjs";
import { type EditorRuntime, WORKER_BASE_URL } from "./runtime-types.ts";

// 编辑器运行时的装配（决策记录 0020、证据文件“装法”）：后台线程是 app://runyard/workers/ 下的独立文件，
// 着色用 Shiki 的 JavaScript 正则引擎（不需要 wasm-unsafe-eval），语法一律从本地文件单个引入。

const THEMES = { light: "github-light", dark: "github-dark" } as const;

// Monaco 里要有这些语言 id，Shiki 才能挂上去；Vue 不是 Monaco 自带的
const MONACO_LANGUAGE_IDS = [
  "typescript",
  "javascript",
  "vue",
  "css",
  "html",
  "json",
  "markdown",
  "python",
  "go",
] as const;

function worker(name: string): Worker {
  return new Worker(`${WORKER_BASE_URL}${name}.js`);
}

function installWorkerEnvironment(): void {
  (globalThis as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker(_id: string, label: string): Worker {
      // 只要着色和 TS 智能提示：CSS、HTML、JSON 没有语言服务线程，落到编辑器线程
      return label === "typescript" || label === "javascript"
        ? worker("ts.worker")
        : worker("editor.worker");
    },
  };
}

export async function createEditorRuntime(): Promise<EditorRuntime> {
  installWorkerEnvironment();
  const engine = createJavaScriptRegexEngine({ forgiving: false });
  const highlighter = await createHighlighterCore({
    themes: [themeLight, themeDark],
    langs: [
      langTypescript,
      langTsx,
      langJavascript,
      langJsx,
      langVue,
      langCss,
      langHtml,
      langJson,
      langMarkdown,
      langPython,
      langGo,
    ],
    engine,
  });
  const known = new Set(monaco.languages.getLanguages().map((language) => language.id));
  for (const id of MONACO_LANGUAGE_IDS) {
    if (!known.has(id)) monaco.languages.register({ id });
  }
  shikiToMonaco(highlighter, monaco);
  // .tsx 也用 Monaco 的 typescript（TS 的功能只挂在 typescript、javascript 两个 id 上），
  // 着色再建一个只含 TSX 语法、改名为 typescript 的高亮器覆盖它；JS 的语法本身带 JSX
  const tsxGrammar = langTsx[0];
  if (tsxGrammar !== undefined) {
    const tsxHighlighter = await createHighlighterCore({
      themes: [themeLight, themeDark],
      langs: [{ ...tsxGrammar, name: "typescript", aliases: [] }],
      engine,
    });
    shikiToMonaco(tsxHighlighter, monaco);
  }
  return { monaco, typescript, themes: { ...THEMES } };
}
