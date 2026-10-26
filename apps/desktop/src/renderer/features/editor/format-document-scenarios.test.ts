// @vitest-environment jsdom
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installRealWorkers } from "../../../../test-support/monaco-test-workers.ts";
import type { VueRequest } from "../../../shared/vue-language.ts";
import type { VueDocumentBridge, VueStatusState } from "../../bridge/vue-language.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { editorLanguageOf } from "./file-language.ts";
import { type FileTab, loadingTab, withContent } from "./file-tab.ts";
import type { FormatMenuLabels } from "./format-support.ts";
import { buildHost, type EditorHost } from "./monaco-host.ts";
import { installMonacoTestEnv } from "./monaco-test-env.ts";
import type { ProjectSource } from "./project-source.ts";
import type { SessionState } from "./session-types.ts";

// “格式化文档”的场景（DESKTOP-EDITOR-96 至 99）：真的 Monaco 和真的 CSS、HTML、JSON、TS 后台线程；
// Vue 一侧换成假的语言服务桥（官方服务器本身由 vue-channel 的真进程测试负责）。

let runtime: EditorRuntime;
beforeAll(async () => {
  installMonacoTestEnv();
  await installRealWorkers();
  const { createEditorRuntime } = await import("../../editor/runtime.ts");
  runtime = await createEditorRuntime();
}, 120_000);

const hosts: EditorHost[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

const LABELS: FormatMenuLabels = {
  python: "格式化文档（暂不支持 Python）",
  go: "格式化文档（暂不支持 Go）",
  other: "格式化文档（这类文件暂不支持）",
  vue: "格式化文档（Vue 语言服务未运行）",
};

function tab(path: string, content: string): FileTab {
  const loaded = loadingTab(path, `id-${path}`);
  return withContent(loaded, {
    kind: "text",
    content,
    eol: "lf",
    size: content.length,
    large: false,
  });
}

interface FakeVue {
  bridge: VueDocumentBridge;
  requests: VueRequest[];
  setState(state: VueStatusState): void;
  /** 下一次格式化请求返回的修改 */
  reply: { value: unknown };
}

function fakeVue(): FakeVue {
  const listeners = new Set<(state: VueStatusState) => void>();
  const requests: VueRequest[] = [];
  const reply = { value: [] as unknown };
  const bridge: VueDocumentBridge = {
    open: async () => {},
    sync: async () => {},
    close: async () => {},
    cancel: () => {},
    diagnostics: () => () => {},
    status: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    request: async (input) => {
      requests.push({ ...input, project: "demo" });
      return { ok: true, value: reply.value };
    },
  };
  return {
    bridge,
    requests,
    reply,
    setState: (state) => {
      for (const listener of listeners) listener(state);
    },
  };
}

function mount(path: string, content: string, vue?: FakeVue) {
  const container = document.createElement("div");
  document.body.append(container);
  const source: ProjectSource = {
    ...(vue ? { vue: vue.bridge } : {}),
    listScripts: async () => [],
    read: async () => null,
    watch: () => () => {},
  };
  const host = buildHost(runtime, container, { onEdit: () => {} }, source, LABELS);
  hosts.push(host);
  const state: SessionState = { tabs: [tab(path, content)], active: path, closePrompt: null };
  host.sync(state, "light");
  const model = runtime.monaco.editor.getModel(runtime.monaco.Uri.parse(`file:///${path}`));
  if (model === null) throw new Error("model missing");
  const editor = runtime.monaco.editor.getEditors().find((e) => e.getModel() === model);
  if (editor === undefined) throw new Error("editor missing");
  return { host, model, editor, container };
}

/**
 * 右键菜单里“格式化文档”那几项的文字和是否置灰。jsdom 没有版面，菜单画不出来，
 * 所以直接问右键菜单控制器它要显示哪些项（和真正弹出菜单时用的是同一个函数）。
 */
async function formatMenuItems(editor: Monaco.editor.ICodeEditor) {
  const controller = editor.getContribution("editor.contrib.contextmenu") as unknown as {
    _getMenuActions(
      model: Monaco.editor.ITextModel | null,
      menuId: unknown,
    ): { label: string; enabled?: boolean }[];
  } | null;
  const menuId = (editor as unknown as { contextMenuId: unknown }).contextMenuId;
  const actions = controller?._getMenuActions(editor.getModel(), menuId) ?? [];
  return actions
    .filter((item) => item.label.includes("格式化文档") || item.label.includes("Format Document"))
    .map((item) => ({ text: item.label, disabled: item.enabled === false }));
}

async function formatNow(editor: Monaco.editor.ICodeEditor): Promise<void> {
  await editor.getAction("editor.action.formatDocument")?.run();
}

/** 语言功能（后台线程、格式化器）是按需加载的：重复执行直到文本变了，等不到就返回 */
async function formatUntilChanged(editor: Monaco.editor.ICodeEditor): Promise<void> {
  const before = editor.getValue();
  for (let i = 0; i < 100 && editor.getValue() === before; i++) {
    await formatNow(editor);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const MESSY: Record<string, string> = {
  "a.ts": "function f( a:number ){return a+1}\n",
  "a.js": "function f( a ){return a+1}\n",
  "a.css": "a{color:red;margin:0}\n",
  "a.html": "<div><p>hi</p></div>\n",
  "a.json": '{"a":1,"b":[1,2]}\n',
};

describe("格式化文档", () => {
  for (const [path, content] of Object.entries(MESSY)) {
    it(`[DESKTOP-EDITOR-97] ${path} 按格式化规则重排，右键菜单里的“格式化文档”可用`, async () => {
      const { model, editor } = mount(path, content);
      expect(editorLanguageOf(path, "full")).not.toBe("plaintext");
      await formatUntilChanged(editor);
      expect(model.getValue()).not.toBe(content);
      // 一次撤销回到格式化前
      editor.trigger("test", "undo", {});
      expect(model.getValue()).toBe(content);
    }, 30_000);
  }

  it("[DESKTOP-EDITOR-97] 右键菜单里有可用的“格式化文档”（Monaco 自带的那一项）", async () => {
    const { editor } = mount("a.ts", MESSY["a.ts"] ?? "");
    const items = await formatMenuItems(editor);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => !item.disabled)).toBe(true);
  });

  for (const [path, label] of [
    ["main.py", LABELS.python],
    ["main.go", LABELS.go],
    ["notes.md", LABELS.other],
  ] as const) {
    it(`[DESKTOP-EDITOR-96] ${path}：右键菜单里置灰并写明原因，快捷键不改文件`, async () => {
      const content = "x   =   1\n";
      const { model, editor } = mount(path, content);
      const items = await formatMenuItems(editor);
      expect(items).toEqual([{ text: expect.stringContaining(label), disabled: true }]);
      await formatNow(editor);
      expect(model.getValue()).toBe(content);
    });
  }
});

describe("Vue 文件的格式化", () => {
  const sfc = "<template>\n<div/>\n</template>\n";
  const edit = {
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
    newText: "  ",
  };

  it("[DESKTOP-EDITOR-98] 经 Vue 语言服务格式化：缩进设置沿用编辑器的，结果套到文件上", async () => {
    const vue = fakeVue();
    vue.reply.value = [edit];
    const { model, editor } = mount("src/App.vue", sfc, vue);
    model.updateOptions({ tabSize: 4, insertSpaces: false });
    await formatNow(editor);
    const sent = vue.requests.find((request) => request.kind === "formatting");
    expect(sent?.format).toEqual({ tabSize: 4, insertSpaces: false });
    expect(sent?.path).toBe("src/App.vue");
    expect(model.getValue()).toBe("<template>\n  <div/>\n</template>\n");
  });

  it("[DESKTOP-EDITOR-98] 服务返回前文件又被修改：不套用旧的结果", async () => {
    const vue = fakeVue();
    vue.reply.value = [edit];
    const { model, editor } = mount("src/App.vue", sfc, vue);
    const original = vue.bridge.request;
    vue.bridge.request = async (input) => {
      model.applyEdits([{ range: new runtime.monaco.Range(3, 1, 3, 1), text: "<!-- x -->\n" }]);
      return original(input);
    };
    await formatNow(editor);
    expect(model.getValue()).toBe("<template>\n<div/>\n<!-- x -->\n</template>\n");
  });

  it("[DESKTOP-EDITOR-99] 服务放弃或重启中：右键菜单置灰并写明原因，服务恢复后重新可用", async () => {
    const vue = fakeVue();
    vue.reply.value = [edit];
    const { model, editor } = mount("src/App.vue", sfc, vue);
    expect((await formatMenuItems(editor)).every((item) => !item.disabled)).toBe(true);
    vue.setState("disabled");
    const blocked = await formatMenuItems(editor);
    expect(blocked).toEqual([{ text: expect.stringContaining(LABELS.vue), disabled: true }]);
    await formatNow(editor);
    expect(model.getValue()).toBe(sfc);
    vue.setState("ready");
    const back = await formatMenuItems(editor);
    expect(back.length).toBeGreaterThan(0);
    expect(back.every((item) => !item.disabled)).toBe(true);
    vue.setState("restarting");
    expect((await formatMenuItems(editor))[0]?.disabled).toBe(true);
  });
});
