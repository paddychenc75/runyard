// @vitest-environment jsdom
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { StandaloneServices } from "monaco-editor/editor/standalone/browser/standaloneServices.js";
import { ICommandService } from "monaco-editor/platform/commands/common/commands.js";
import { IConfigurationService } from "monaco-editor/platform/configuration/common/configuration.js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildTsWorker, NodeBackedWorker } from "../../../../test-support/monaco-test-workers.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { type FileTab, loadingTab, withContent } from "./file-tab.ts";
import { buildHost, type EditorHost, type EditorHostHandlers } from "./monaco-host.ts";
import { installMonacoTestEnv } from "./monaco-test-env.ts";
import { isScriptPath, type ProjectSource } from "./project-source.ts";
import type { SessionState } from "./session-types.ts";
import { externalRemove, externalWrite, type FakeDisk, fakeDisk } from "./test-files.ts";
import { MARKER_OWNER } from "./typescript-diagnostics.ts";

// 智能提示的场景（DESKTOP-EDITOR-40 到 46）：用真的 Monaco、真的 Shiki、真的 TypeScript 语言服务
// （后台线程由 monaco-test-workers.ts 放进 node 线程），项目文件来自内存里的磁盘。

let runtime: EditorRuntime;
beforeAll(async () => {
  installMonacoTestEnv();
  const file = await buildTsWorker();
  (globalThis as unknown as { Worker: unknown }).Worker = class extends NodeBackedWorker {
    constructor() {
      super(file);
    }
  };
  const { createEditorRuntime } = await import("../../editor/runtime.ts");
  runtime = await createEditorRuntime();
  // 热身：第一次问语言服务要起线程、载入标准库，慢的 CI 机器上能超过用例的 5 秒；这笔冷启动在装载阶段付掉
  const warm = runtime.monaco.editor.createModel("const warm: number = 1;", "typescript");
  const getWorker = await runtime.typescript.getTypeScriptWorker();
  await (await getWorker(warm.uri)).getSemanticDiagnostics(warm.uri.toString());
  warm.dispose();
}, 120_000);

const commands = () =>
  StandaloneServices.get<{ executeCommand(id: string): Promise<unknown> }>(ICommandService);

const hosts: EditorHost[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
});

function memorySource(disk: FakeDisk): ProjectSource {
  return {
    listScripts: async () => [...disk.files.keys()].filter(isScriptPath),
    read: async (path) => {
      const file = disk.files.get(path);
      return file?.kind === "text" ? file.content : null;
    },
    watch(listener) {
      disk.watchers.add(listener);
      return () => disk.watchers.delete(listener);
    },
  };
}

function textTab(path: string, content: string): FileTab {
  return withContent(loadingTab(path, `id-${path}`), {
    kind: "text",
    content,
    eol: "lf",
    size: content.length,
    large: false,
  });
}

interface Opened {
  path: string;
  at: Monaco.IPosition | undefined;
}

function mount(disk: FakeDisk, openPaths: string[], active: string = openPaths[0] ?? "") {
  const container = document.createElement("div");
  document.body.append(container);
  const opened: Opened[] = [];
  const strays: { path: string; text: string }[] = [];
  const handlers: EditorHostHandlers = {
    onEdit: () => {},
    onOpenFile: (path, at) => opened.push({ path, at }),
    onStrayEdit: (path, text) => strays.push({ path, text }),
  };
  const host = buildHost(runtime, container, handlers, memorySource(disk));
  hosts.push(host);
  const tabs = openPaths.map((path) => {
    const file = disk.files.get(path);
    return textTab(path, file?.kind === "text" ? file.content : "");
  });
  const state: SessionState = { tabs, active, closePrompt: null };
  host.sync(state, "light");
  const modelOf = (path: string) => {
    const model = runtime.monaco.editor.getModel(runtime.monaco.Uri.parse(`file:///${path}`));
    if (model === null) throw new Error(`model missing: ${path}`);
    return model;
  };
  const editorOf = (path: string) => {
    const model = modelOf(path);
    const editor = runtime.monaco.editor.getEditors().find((e) => e.getModel() === model);
    if (editor === undefined) throw new Error(`editor missing: ${path}`);
    return editor;
  };
  return { host, state, opened, strays, modelOf, editorOf };
}

async function until<T>(
  read: () => T | undefined | false | Promise<T | undefined | false>,
  what: string,
  ms = 10_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > end) throw new Error(`等不到：${what}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

const markersOf = (model: Monaco.editor.ITextModel) =>
  runtime.monaco.editor.getModelMarkers({ resource: model.uri, owner: MARKER_OWNER });

async function workerFor(model: Monaco.editor.ITextModel) {
  const get = await runtime.typescript.getTypeScriptWorker();
  return get(model.uri);
}

const MATH = "export function addTwo(a: number, b: number): number {\n  return a + b;\n}\n";
const APP_TYPING = 'import { addTwo } from "./math";\n\nconst total = addT';
const APP_CALL = 'import { addTwo } from "./math";\n\nconst total = addTwo(1, 2);\n';

describe("项目文件的智能提示", () => {
  it("[DESKTOP-EDITOR-40] 补全项目里另一个没打开的文件导出的函数，带参数说明", async () => {
    const disk = fakeDisk({ "src/math.ts": MATH, "src/App.tsx": APP_TYPING });
    const { modelOf } = mount(disk, ["src/App.tsx"]);
    const app = modelOf("src/App.tsx");
    const file = app.uri.toString();
    const offset = app.getValueLength();
    const worker = await workerFor(app);
    const found = await until(async () => {
      const result = await worker.getCompletionsAtPosition(file, offset);
      return result?.entries.some((e: { name: string }) => e.name === "addTwo");
    }, "补全列表里出现 addTwo");
    expect(found).toBe(true);
    const details = await worker.getCompletionEntryDetails(file, offset, "addTwo");
    const signature = (details?.displayParts ?? []).map((p: { text: string }) => p.text).join("");
    expect(signature).toContain("addTwo(a: number, b: number): number");
  });

  it("[DESKTOP-EDITOR-41] 对另一个文件里的函数用“跳转到定义”，打开那个文件的标签，光标在定义处", async () => {
    const disk = fakeDisk({ "src/math.ts": MATH, "src/App.tsx": APP_CALL });
    const { editorOf, opened } = mount(disk, ["src/App.tsx"]);
    const editor = editorOf("src/App.tsx");
    editor.setPosition({ lineNumber: 3, column: 18 });
    editor.focus();
    // 项目文件读完、登记进语言服务之前跳不过去，所以重试到定义出现（和按 F12 走同一条命令）
    await until(() => {
      void commands().executeCommand("editor.action.revealDefinition");
      return opened.length > 0;
    }, "跳转打开 src/math.ts");
    expect(opened[0]?.path).toBe("src/math.ts");
    expect(opened[0]?.at).toEqual({ lineNumber: 1, column: 17 });
  });

  it('[DESKTOP-EDITOR-42] 写 const n: number = "a" 出现错误标记，说明是类型不匹配', async () => {
    const disk = fakeDisk({ "src/App.tsx": 'const n: number = "a";\n' });
    const { modelOf } = mount(disk, ["src/App.tsx"]);
    const app = modelOf("src/App.tsx");
    const markers = await until(() => {
      const found = markersOf(app);
      return found.length > 0 ? found : undefined;
    }, "类型错误的标记");
    expect(markers[0]?.severity).toBe(runtime.monaco.MarkerSeverity.Error);
    expect(markers[0]?.code).toBe("2322");
    expect(markers[0]?.message).toContain("Type 'string' is not assignable to type 'number'");
    // 波浪线落在变量 n 上
    expect(markers[0]).toMatchObject({ startLineNumber: 1, startColumn: 7, endColumn: 8 });
  });

  it("[DESKTOP-EDITOR-43] import react 找不到类型时，没有“找不到模块”一类的错误，真的类型错误仍然有", async () => {
    const code =
      'import { useState } from "react";\nimport "./nope";\nexport default function App() {\n  const [count, setCount] = useState(0);\n  const bad: number = "x";\n  return <button onClick={() => setCount((value) => value + 1)}>{count}</button>;\n}\n';
    const disk = fakeDisk({ "src/App.tsx": code });
    const { modelOf } = mount(disk, ["src/App.tsx"]);
    const app = modelOf("src/App.tsx");
    const markers = await until(() => {
      const found = markersOf(app);
      return found.length > 0 ? found : undefined;
    }, "检查结果");
    // 等一轮完整的检查跑完：唯一留下的是第 5 行的真错误
    await new Promise((resolve) => setTimeout(resolve, 600));
    const codes = markersOf(app).map((marker) => marker.code);
    expect(markers.length).toBeGreaterThan(0);
    expect(codes).toEqual(["2322"]);
  });

  it("[DESKTOP-EDITOR-44] 命令行把 math.ts 里的 addTwo 改名为 sum，几秒内 App.tsx 里的 addTwo 出现错误", async () => {
    const disk = fakeDisk({ "src/math.ts": MATH, "src/App.tsx": APP_CALL });
    const { modelOf } = mount(disk, ["src/App.tsx"]);
    const app = modelOf("src/App.tsx");
    // 开始是没有错误的（等项目文件登记进去、检查跑过一轮）
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(markersOf(app)).toEqual([]);
    const started = Date.now();
    externalWrite(disk, "src/math.ts", MATH.replace("addTwo", "sum"));
    const markers = await until(() => {
      const found = markersOf(app);
      return found.length > 0 ? found : undefined;
    }, "改名后的错误标记");
    expect(Date.now() - started).toBeLessThan(3000);
    expect(markers.map((marker) => marker.code)).toContain("2305");
    expect(markers[0]?.message).toContain("addTwo");
  });
});

describe("不联网、Vue 和改名", () => {
  it("[DESKTOP-EDITOR-45] 打开 .ts、.tsx、.vue 并补全、跳转、悬停：没有任何发往本机以外的请求", async () => {
    const requests: string[] = [];
    const target = globalThis as unknown as Record<string, unknown>;
    const spy = (name: string) => {
      const original = target[name];
      target[name] = function recorded(this: unknown, ...args: unknown[]) {
        requests.push(`${name}(${String(args[0])})`);
        return typeof original === "function" ? Reflect.apply(original, this, args) : undefined;
      };
      return () => {
        target[name] = original;
      };
    };
    const restore = [spy("fetch"), spy("WebSocket"), spy("EventSource")];
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function recorded(this: XMLHttpRequest, ...args: unknown[]) {
      requests.push(`xhr(${String(args[1])})`);
      return Reflect.apply(open, this, args);
    } as typeof open;
    const beaconBefore = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string) => {
        requests.push(`beacon(${url})`);
        return true;
      },
    });
    try {
      const disk = fakeDisk({
        "src/math.ts": MATH,
        "src/App.tsx": APP_CALL,
        "src/App.vue":
          '<script setup lang="ts">\nimport { ref } from "vue";\nconst n = ref(1);\n</script>\n',
      });
      const { editorOf, modelOf, opened } = mount(disk, ["src/App.tsx", "src/App.vue"]);
      const editor = editorOf("src/App.tsx");
      editor.setPosition({ lineNumber: 3, column: 18 });
      editor.focus();
      const worker = await workerFor(modelOf("src/App.tsx"));
      await until(async () => {
        const hover = await worker.getQuickInfoAtPosition(
          modelOf("src/App.tsx").uri.toString(),
          modelOf("src/App.tsx").getOffsetAt({ lineNumber: 3, column: 18 }),
        );
        return hover !== undefined;
      }, "悬停信息");
      await until(() => {
        void commands().executeCommand("editor.action.revealDefinition");
        return opened.length > 0;
      }, "跳转");
      await worker.getCompletionsAtPosition(
        modelOf("src/App.tsx").uri.toString(),
        modelOf("src/App.tsx").getValueLength(),
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      // 页面里也没有指向外部地址的脚本、样式、图片
      const external = [...document.querySelectorAll("[src],[href]")]
        .map((el) => el.getAttribute("src") ?? el.getAttribute("href") ?? "")
        .filter((url) => /^(https?:)?\/\//.test(url));
      expect(requests).toEqual([]);
      expect(external).toEqual([]);
    } finally {
      for (const undo of restore) undo();
      XMLHttpRequest.prototype.open = open;
      if (beaconBefore === undefined) Reflect.deleteProperty(navigator, "sendBeacon");
      else Object.defineProperty(navigator, "sendBeacon", beaconBefore);
    }
  });

  it("[DESKTOP-EDITOR-46] 打开 App.vue：有着色，没有错误标记，输入时没有基于文字的补全", async () => {
    const vue =
      '<template>\n  <Hello :n="n" />\n</template>\n<script setup lang="ts">\nimport { ref } from "vue";\nimport Hello from "./Hello.vue";\nconst n: number = ref(1);\n</script>\n';
    const disk = fakeDisk({ "src/App.vue": vue, "src/Hello.vue": "<template><b /></template>\n" });
    const { editorOf, modelOf } = mount(disk, ["src/App.vue"]);
    const model = modelOf("src/App.vue");
    expect(model.getLanguageId()).toBe("vue");
    // 有着色：模板、脚本、样式不是同一种记号
    const kinds = new Set<string>();
    for (const line of runtime.monaco.editor.tokenize(vue, "vue")) {
      for (const token of line) kinds.add(token.type);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    // 没有错误标记：自带的和我们的都没有（Vue 不进语言服务）
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(runtime.monaco.editor.getModelMarkers({ resource: model.uri })).toEqual([]);
    // 基于文字的建议和输入时自动弹出都关了
    const editor = editorOf("src/App.vue");
    // Monaco 0.57 的“基于文字的建议”读的是配置服务里的 editor.wordBasedSuggestions（editor.updateOptions 会写进去）
    const config = StandaloneServices.get<{ getValue(key: string): unknown }>(
      IConfigurationService,
    );
    expect(config.getValue("editor.wordBasedSuggestions")).toBe("off");
    expect(editor.getRawOptions().quickSuggestions).toEqual({
      other: "off",
      comments: "off",
      strings: "off",
    });
    // 换到 TS 文件，文字建议恢复（只有 Vue 关）
    const ts = mount(fakeDisk({ "src/a.ts": "const a = 1;\n" }), ["src/a.ts"]);
    expect(ts.editorOf("src/a.ts")).toBeDefined();
    expect(config.getValue("editor.wordBasedSuggestions")).toBe("matchingDocuments");
  });

  it("改名：把 math.ts（没打开）里的 addTwo 改名为 sum，App.tsx 里的引用一起改，math.ts 的改动交给会话保存", async () => {
    const disk = fakeDisk({ "src/math.ts": MATH, "src/App.tsx": APP_CALL });
    const { editorOf, strays, modelOf } = mount(disk, ["src/App.tsx"]);
    const editor = editorOf("src/App.tsx");
    editor.setPosition({ lineNumber: 3, column: 18 });
    editor.focus();
    // 项目文件登记进语言服务之前改名会被拒绝，等到能改
    await until(async () => {
      const worker = await workerFor(modelOf("src/App.tsx"));
      const info = await worker.getRenameInfo(modelOf("src/App.tsx").uri.toString(), 50, {});
      return info.canRename === true;
    }, "能改名");
    const controller = editor.getContribution("editor.contrib.renameController") as unknown as {
      run(): Promise<void>;
      acceptRenameInput(wantsPreview: boolean): void;
    };
    const running = controller.run();
    const input = await until(
      () =>
        document.querySelector<HTMLInputElement>(".rename-box input, .rename-input") ?? undefined,
      "改名输入框",
    );
    input.value = "sum";
    controller.acceptRenameInput(false);
    await running;
    expect(editor.getValue()).toBe('import { sum } from "./math";\n\nconst total = sum(1, 2);\n');
    const changed = await until(
      () => strays.find((entry) => entry.path === "src/math.ts"),
      "math.ts 的改动",
    );
    expect(changed.text).toBe(MATH.replace("addTwo", "sum"));
  });
});

describe("项目文件只登记，不建模型", () => {
  it("500 个文件的项目只给打开的文件建模型，其余登记成 extra lib，第一次补全很快", async () => {
    const files: Record<string, string> = { "src/App.tsx": APP_TYPING };
    for (let i = 0; i < 499; i++) {
      files[`src/gen/mod${i}.ts`] =
        `export function fn${i}(a: number): number {\n  return a + ${i};\n}\n`;
    }
    files["src/math.ts"] = MATH;
    const disk = fakeDisk(files);
    const before = runtime.monaco.editor.getModels().length;
    const started = Date.now();
    const { modelOf } = mount(disk, ["src/App.tsx"]);
    const app = modelOf("src/App.tsx");
    const worker = await workerFor(app);
    await until(async () => {
      const result = await worker.getCompletionsAtPosition(
        app.uri.toString(),
        app.getValueLength(),
      );
      return result?.entries.some((e: { name: string }) => e.name === "addTwo");
    }, "补全列表里出现 addTwo");
    const elapsed = Date.now() - started;
    expect(Object.keys(runtime.typescript.typescriptDefaults.getExtraLibs())).toHaveLength(500);
    expect(runtime.monaco.editor.getModels().length - before).toBe(1);
    process.stderr.write(`TIMING 500 files first completion ${elapsed} ms\n`);
    // K8：每个文件一个模型要 26 到 32 秒；登记成 extra lib 是 254 毫秒。给慢机器留足余量
    expect(elapsed).toBeLessThan(8000);
  }, 30_000);

  it("同一路径先是 extra lib、后开成标签：新内容的类型生效，不是旧的（版本号陷阱）", async () => {
    const disk = fakeDisk({ "src/math.ts": MATH, "src/App.tsx": APP_CALL });
    const { host, state, modelOf } = mount(disk, ["src/App.tsx"]);
    const app = modelOf("src/App.tsx");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(markersOf(app)).toEqual([]);
    // 打开 math.ts：标签里的内容和 extra lib 里的不同（addTwo 已改名）。模型版本号是 1，extra lib 也是 1
    const renamed = textTab("src/math.ts", MATH.replace("addTwo", "sum"));
    host.sync({ ...state, tabs: [...state.tabs, renamed] }, "light");
    const markers = await until(() => {
      const found = markersOf(app);
      return found.length > 0 ? found : undefined;
    }, "App.tsx 里 addTwo 的错误");
    expect(markers.map((marker) => marker.code)).toContain("2305");
  });

  it("关掉正在编辑的文件：它没保存的内容回到 extra lib，别的文件里的引用按这份内容检查", async () => {
    const disk = fakeDisk({ "src/math.ts": MATH, "src/App.tsx": APP_CALL });
    const { host, state, modelOf } = mount(disk, ["src/App.tsx", "src/math.ts"]);
    const app = modelOf("src/App.tsx");
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(markersOf(app)).toEqual([]);
    // 在 math.ts 里把 addTwo 改名为 sum（不保存），然后把它的标签关掉
    modelOf("src/math.ts").setValue(MATH.replace("addTwo", "sum"));
    host.sync({ ...state, tabs: state.tabs.filter((tab) => tab.path !== "src/math.ts") }, "light");
    const markers = await until(() => {
      const found = markersOf(app);
      return found.length > 0 ? found : undefined;
    }, "关掉后 App.tsx 里的错误");
    expect(markers.map((marker) => marker.code)).toContain("2305");
    expect(
      runtime.monaco.editor.getModel(runtime.monaco.Uri.parse("file:///src/math.ts")),
    ).toBeNull();
  });

  it("项目里新增、删除脚本：磁盘变化合并后更新登记的文件", async () => {
    const disk = fakeDisk({
      "src/App.tsx": 'import { extra } from "./extra";\nconst n: number = extra;\n',
    });
    const { modelOf } = mount(disk, ["src/App.tsx"]);
    const app = modelOf("src/App.tsx");
    await new Promise((resolve) => setTimeout(resolve, 800));
    // ./extra 还不存在：找不到模块被屏蔽，extra 当成 any，没有错误
    expect(markersOf(app)).toEqual([]);
    externalWrite(disk, "src/extra.ts", 'export const extra: string = "x";\n');
    await until(
      () => markersOf(app).some((marker) => marker.code === "2322"),
      "新增文件后的类型错误",
    );
    externalRemove(disk, "src/extra.ts");
    await until(() => markersOf(app).length === 0, "删除文件后错误消失");
  });
});
