// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installRealWorkers } from "../../../../test-support/monaco-test-workers.ts";
import { builtinTemplateIds, templateFiles } from "../../../../test-support/template-files.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { loadingTab, withContent } from "./file-tab.ts";
import { buildHost, type EditorHost } from "./monaco-host.ts";
import { installMonacoTestEnv } from "./monaco-test-env.ts";
import { isScriptPath, type ProjectSource } from "./project-source.ts";
import type { SessionState } from "./session-types.ts";

// 新建出来的每个内置模板，打开里面的脚本文件都不该有任何诊断（issue #443）：
// 依赖还没装、编辑器也不读项目自己的 tsconfig，所以语言服务只能靠内置的设置不误报。

let runtime: EditorRuntime;
beforeAll(async () => {
  installMonacoTestEnv();
  await installRealWorkers();
  const { createEditorRuntime } = await import("../../editor/runtime.ts");
  runtime = await createEditorRuntime();
  const warm = runtime.monaco.editor.createModel("const warm: number = 1;", "typescript");
  const getWorker = await runtime.typescript.getTypeScriptWorker();
  await (await getWorker(warm.uri)).getSemanticDiagnostics(warm.uri.toString());
  warm.dispose();
}, 120_000);

const hosts: EditorHost[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
});

describe("内置模板新建后的诊断", () => {
  it.each(builtinTemplateIds())(
    "模板 %s 新建后打开所有脚本文件，没有任何诊断",
    async (id) => {
      const files = templateFiles(id);
      const source: ProjectSource = {
        listScripts: async () => [...files.keys()].filter(isScriptPath),
        read: async (path) => files.get(path) ?? null,
        watch: () => () => {},
      };
      const container = document.createElement("div");
      document.body.append(container);
      const host = buildHost(
        runtime,
        container,
        { onEdit: () => {}, onOpenFile: () => {}, onStrayEdit: () => {} },
        source,
      );
      hosts.push(host);
      const scripts = [...files.keys()].filter(isScriptPath);
      const tabs = scripts.map((path) =>
        withContent(loadingTab(path, `id-${path}`), {
          kind: "text",
          content: files.get(path) ?? "",
          eol: "lf",
          size: 0,
          large: false,
        }),
      );
      const state: SessionState = { tabs, active: scripts[0] ?? "", closePrompt: null };
      host.sync(state, "light");
      // 等项目文件登记、语义检查跑完几轮
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const problems = runtime.monaco.editor
        .getModelMarkers({})
        .map((m) => `${m.resource.path}:${m.startLineNumber} [${m.code}] ${m.message}`);
      expect(problems).toEqual([]);
    },
    30_000,
  );
});

describe("编辑器的非代码设置", () => {
  it("中文全角标点不标成易混淆字符，看不见的字符仍然提示；浮层不被卡片裁剪", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const host = buildHost(
      runtime,
      container,
      { onEdit: () => {}, onOpenFile: () => {}, onStrayEdit: () => {} },
      undefined,
    );
    hosts.push(host);
    const editor = runtime.monaco.editor.getEditors().at(-1);
    if (editor === undefined) throw new Error("没有编辑器");
    const { EditorOption } = runtime.monaco.editor;
    const unicode = editor.getOption(EditorOption.unicodeHighlighting);
    expect(unicode.ambiguousCharacters).toBe(false);
    expect(unicode.invisibleCharacters).toBe(true);
    expect(editor.getOption(EditorOption.fixedOverflowWidgets)).toBe(true);
    expect(editor.getOption(EditorOption.suggest).showStatusBar).toBe(false);
  });
});
