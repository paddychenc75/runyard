import "./monaco-features.ts";
import { shikiThemes } from "@runyard/tokens";
import { shikiToMonaco } from "@shikijs/monaco";
import * as monaco from "monaco-editor/editor/editor.api.js";
import * as json from "monaco-editor/languages/features/json/register.js";
import * as typescript from "monaco-editor/languages/features/typescript/register.js";
import { createHighlighterCore, type ThemeInput } from "shiki/core";
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
import { editorMenu } from "./runtime-menu.ts";
import { type EditorRuntime, WORKER_BASE_URL } from "./runtime-types.ts";

// 编辑器运行时的装配（决策记录 0020、证据文件“装法”）：后台线程是 app://runyard/workers/ 下的独立文件，
// 着色用 Shiki 的 JavaScript 正则引擎（不需要 wasm-unsafe-eval），语法一律从本地文件单个引入。

// 配色来自设计变量（packages/tokens 生成的 shikiThemes，设计稿的代码配色），不用 Shiki 自带的 GitHub 主题
const THEMES = { light: shikiThemes.light.name, dark: shikiThemes.dark.name } as const;

// 属性名、Markdown 等额外的语法范围也登记在设计变量里（shikiThemes），这里不再另配颜色
const THEME_REGISTRATIONS: ThemeInput[] = [
  shikiThemes.light as unknown as ThemeInput,
  shikiThemes.dark as unknown as ThemeInput,
];

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
      // 每种有语言服务的语言一个线程；其余（Markdown、Python、Go、Vue）只有着色，用编辑器线程
      switch (label) {
        case "typescript":
        case "javascript":
          return worker("ts.worker");
        case "css":
        case "scss":
        case "less":
          return worker("css.worker");
        case "html":
        case "handlebars":
        case "razor":
          return worker("html.worker");
        case "json":
          return worker("json.worker");
        default:
          return worker("editor.worker");
      }
    },
  };
}

export async function createEditorRuntime(): Promise<EditorRuntime> {
  installWorkerEnvironment();
  const engine = createJavaScriptRegexEngine({ forgiving: false });
  const highlighter = await createHighlighterCore({
    themes: THEME_REGISTRATIONS,
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
  // JSON 的语言服务自带一个着色器，会在第一个 JSON 模型出现时盖掉 Shiki 的；着色一律用 Shiki，所以关掉它的
  json.jsonDefaults.setModeConfiguration({ ...json.jsonDefaults.modeConfiguration, tokens: false });
  // .tsx 也用 Monaco 的 typescript（TS 的功能只挂在 typescript、javascript 两个 id 上），
  // 着色再建一个只含 TSX 语法、改名为 typescript 的高亮器覆盖它；JS 的语法本身带 JSX
  const tsxGrammar = langTsx[0];
  if (tsxGrammar !== undefined) {
    const tsxHighlighter = await createHighlighterCore({
      themes: THEME_REGISTRATIONS,
      langs: [{ ...tsxGrammar, name: "typescript", aliases: [] }],
      engine,
    });
    shikiToMonaco(tsxHighlighter, monaco);
  }
  return { monaco, typescript, menu: editorMenu, themes: { ...THEMES } };
}
