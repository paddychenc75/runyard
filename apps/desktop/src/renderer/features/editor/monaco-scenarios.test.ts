// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import type { SessionState } from "./editor-session.ts";
import { languageOf } from "./file-language.ts";
import { type FileTab, loadingTab, withContent } from "./file-tab.ts";
import { buildHost } from "./monaco-host.ts";
import { installMonacoTestEnv } from "./monaco-test-env.ts";

// 用真的 Monaco 和 Shiki（jsdom 里没有版面和后台线程，只测内容、选区、着色和主题这些不靠它们的行为）

let runtime: EditorRuntime;
beforeAll(async () => {
  installMonacoTestEnv();
  const { createEditorRuntime } = await import("../../editor/runtime.ts");
  runtime = await createEditorRuntime();
}, 60_000);

function tokenTypes(code: string, file: string): Set<string> {
  const kinds = new Set<string>();
  for (const line of runtime.monaco.editor.tokenize(code, languageOf(file))) {
    for (const token of line) kinds.add(token.type);
  }
  return kinds;
}

const SAMPLES: Record<string, string> = {
  "a.ts": 'const n: number = 1; // 注释\nexport function f(s: string) { return "x" + s }\n',
  "a.tsx":
    'export default function App() {\n  return <main className="card">{"x"}</main> // 注释\n}\n',
  "a.js": 'const n = 1; // 注释\nfunction f(s) { return "x" + s }\n',
  "a.jsx": 'export default function App() {\n  return <main className="card">x</main> // 注释\n}\n',
  "a.vue":
    '<template>\n  <button class="btn">{{ n }}</button>\n</template>\n<script setup lang="ts">\nconst n: number = 1\n</script>\n<style scoped>\n.btn { color: red }\n</style>\n',
  "a.css": "/* 注释 */\n.btn { color: red; margin: 0 }\n",
  "a.html": '<!-- 注释 -->\n<main class="card"><h1>Hi</h1></main>\n',
  "a.json": '{ "name": "demo", "n": 1, "ok": true }\n',
  "a.md": "# 标题\n\n**粗体** 和 `代码`\n\n- 列表\n",
  "a.py": 'import os\n# 注释\ndef f(s):\n    return "x" + s\n',
  "a.go": 'package main\n// 注释\nfunc main() { println("x", 1) }\n',
};

describe("编辑器着色", () => {
  it("[DESKTOP-EDITOR-37] 每种语言的关键字、字符串、注释用不同的颜色，不是单色纯文本", () => {
    for (const [file, code] of Object.entries(SAMPLES)) {
      const kinds = tokenTypes(code, file);
      expect(kinds.size, `${file} 的记号种类：${[...kinds].join(", ")}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("[DESKTOP-EDITOR-38] Vue 单文件组件的模板、脚本、样式三段各按自己的语言着色", () => {
    const lines = runtime.monaco.editor.tokenize(SAMPLES["a.vue"] ?? "", "vue");
    const typesOf = (line: number) => new Set((lines[line] ?? []).map((token) => token.type));
    // 第 2 行 <button class="btn">：标签、属性名、属性值
    expect(typesOf(1)).toContain("entity.name.tag");
    expect(typesOf(1)).toContain("entity.name.function");
    expect(typesOf(1)).toContain("string");
    // 第 5 行 const n: number = 1（lang="ts"）：TypeScript 的关键字和数字
    expect(typesOf(4)).toContain("keyword");
    expect(typesOf(4)).toContain("constant.numeric");
    // 第 8 行 .btn { color: red }：样式里的属性名
    expect(typesOf(7)).toContain("entity.name.function");
  });
});

function textTab(path: string, content: string): FileTab {
  return withContent(loadingTab(path), {
    kind: "text",
    content,
    eol: "lf",
    size: content.length,
    large: false,
  });
}

function mountHost(path: string, content: string, edits: string[] = []) {
  const container = document.createElement("div");
  document.body.append(container);
  const host = buildHost(runtime, container, {
    onEdit: (_path, text) => edits.push(text),
  });
  const state: SessionState = { tabs: [textTab(path, content)], active: path, closePrompt: null };
  host.sync(state, "light");
  const model = runtime.monaco.editor.getModels().find((m) => m.uri.path === `/${path}`);
  if (model === undefined) throw new Error("model missing");
  const editor = runtime.monaco.editor.getEditors().find((e) => e.getModel() === model);
  if (editor === undefined) throw new Error("editor missing");
  return { host, state, model, editor, container };
}

describe("语言服务的配置", () => {
  it("装配编辑器时 TS 和 JS 的诊断屏蔽“找不到模块”一类的误报，选项照 K8 的装法", () => {
    const { host } = mountHost("src/App.tsx", "const a = 1;");
    for (const defaults of [
      runtime.typescript.typescriptDefaults,
      runtime.typescript.javascriptDefaults,
    ]) {
      expect(defaults.getDiagnosticsOptions().diagnosticCodesToIgnore).toEqual(
        expect.arrayContaining([2307, 2792, 7016, 7026, 2875, 7044]),
      );
      expect(defaults.getCompilerOptions()).toMatchObject({ allowJs: true, noEmit: true });
    }
    host.dispose();
  });
});

describe("编辑器的主题、查找替换和多光标", () => {
  it("[DESKTOP-EDITOR-39] 应用换成深色时编辑器立即换配色，内容和光标位置不变", () => {
    const { host, state, editor, container } = mountHost(
      "src/App.tsx",
      "const a = 1;\nconst b = 2;\n",
    );
    editor.setPosition({ lineNumber: 2, column: 5 });
    const root = () => container.querySelector(".monaco-editor");
    expect(root()?.classList.contains("vs-dark")).toBe(false);
    host.sync(state, "dark");
    expect(root()?.classList.contains("vs-dark")).toBe(true);
    expect(editor.getPosition()).toMatchObject({ lineNumber: 2, column: 5 });
    expect(editor.getValue()).toBe("const a = 1;\nconst b = 2;\n");
    host.sync(state, "light");
    expect(root()?.classList.contains("vs-dark")).toBe(false);
    host.dispose();
  });

  it("[DESKTOP-EDITOR-53] 选中第一处 count，按两次 ⌘D，输入 total，三处同时改", () => {
    const edits: string[] = [];
    const { host, editor } = mountHost("src/App.tsx", "count + count + count", edits);
    editor.focus();
    editor.setSelection(new runtime.monaco.Selection(1, 1, 1, 6));
    editor.trigger("keyboard", "editor.action.addSelectionToNextFindMatch", null);
    editor.trigger("keyboard", "editor.action.addSelectionToNextFindMatch", null);
    expect(editor.getSelections()).toHaveLength(3);
    editor.trigger("keyboard", "type", { text: "total" });
    expect(editor.getValue()).toBe("total + total + total");
    expect(edits.at(-1)).toBe("total + total + total");
    host.dispose();
  });

  it("[DESKTOP-EDITOR-52] 查找 count 替换为 total，全部替换后三处都换了，改动交回会话", async () => {
    const edits: string[] = [];
    const { host, editor } = mountHost(
      "src/App.tsx",
      "count = 1;\nconst count2 = count;\nlog(count);",
      edits,
    );
    editor.focus();
    const find = editor.getContribution("editor.contrib.findController") as unknown as {
      getState(): { change(change: object, moveCursor: boolean): void };
      start(options: object): Promise<void>;
      replaceAll(): void;
    };
    // ⌥⌘F 打开的就是带替换框的查找控件；jsdom 没有按键，直接走同一个控制器
    await find.start({
      forceRevealReplace: true,
      seedSearchStringFromSelection: "never",
      seedSearchStringFromNonEmptySelection: false,
      shouldFocus: 0,
      shouldAnimate: false,
      updateSearchScope: false,
      loop: true,
    });
    find
      .getState()
      .change({ searchString: "count", replaceString: "total", isRegex: false }, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    find.replaceAll();
    expect(editor.getValue()).toBe("total = 1;\nconst total2 = total;\nlog(total);");
    expect(edits.at(-1)).toBe("total = 1;\nconst total2 = total;\nlog(total);");
    host.dispose();
  });
});
