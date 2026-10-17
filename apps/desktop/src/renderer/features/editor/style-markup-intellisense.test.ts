// @vitest-environment jsdom

import { ILanguageFeaturesService } from "monaco-editor/editor/common/services/languageFeatures.js";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { StandaloneServices } from "monaco-editor/editor/standalone/browser/standaloneServices.js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installRealWorkers } from "../../../../test-support/monaco-test-workers.ts";
import type { EditorRuntime } from "../../editor/runtime-types.ts";
import { installMonacoTestEnv } from "./monaco-test-env.ts";

// CSS、HTML、JSON 的语言服务（补全、悬停、校验）：真的 Monaco 和真的后台线程，
// 经 Monaco 登记的提供者取结果（和界面里弹出补全、悬停走同一条路），并记下每种语言的补全耗时。

let runtime: EditorRuntime;
beforeAll(async () => {
  installMonacoTestEnv();
  await installRealWorkers();
  const { createEditorRuntime } = await import("../../editor/runtime.ts");
  runtime = await createEditorRuntime();
  // 热身：每种语言第一次要起线程，慢的 CI 机器上能超过用例的 5 秒；这笔冷启动在装载阶段付掉
  const warm = [
    open("css", "a { col }", "warm/a.css"),
    open("html", "<di", "warm/a.html"),
    open("json", '{ "": 1 }', "warm/a.json"),
  ];
  for (const model of warm)
    await until(
      async () =>
        (await labels(model, model.getFullModelRange().getEndPosition())).length > 0 || undefined,
      "热身",
    );
  for (const model of models.splice(0)) model.dispose();
}, 120_000);

const models: Monaco.editor.ITextModel[] = [];
afterEach(() => {
  for (const model of models.splice(0)) model.dispose();
});

interface Providers<T> {
  ordered(model: Monaco.editor.ITextModel): T[];
}
interface FeatureService {
  completionProvider: Providers<{
    provideCompletionItems(
      model: Monaco.editor.ITextModel,
      position: Monaco.IPosition,
      context: { triggerKind: number },
      token: Monaco.CancellationToken,
    ): Promise<{ suggestions: { label: string | { label: string } }[] } | undefined>;
  }>;
  hoverProvider: Providers<{
    provideHover(
      model: Monaco.editor.ITextModel,
      position: Monaco.IPosition,
      token: Monaco.CancellationToken,
    ): Promise<{ contents: { value: string }[] } | undefined>;
  }>;
}
const features = () => StandaloneServices.get<FeatureService>(ILanguageFeaturesService);
const NONE = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

function open(language: string, text: string, path: string) {
  const model = runtime.monaco.editor.createModel(
    text,
    language,
    runtime.monaco.Uri.parse(`file:///${path}`),
  );
  models.push(model);
  return model;
}

async function until<T>(read: () => Promise<T | undefined | false>, what: string): Promise<T> {
  const end = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > end) throw new Error(`等不到：${what}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

async function labels(model: Monaco.editor.ITextModel, at: Monaco.IPosition): Promise<string[]> {
  const found: string[] = [];
  for (const provider of features().completionProvider.ordered(model)) {
    const list = await provider.provideCompletionItems(
      model,
      at,
      { triggerKind: 0 },
      NONE as never,
    );
    for (const item of list?.suggestions ?? []) {
      found.push(typeof item.label === "string" ? item.label : item.label.label);
    }
  }
  return found;
}

async function hoverText(model: Monaco.editor.ITextModel, at: Monaco.IPosition): Promise<string> {
  let text = "";
  for (const provider of features().hoverProvider.ordered(model)) {
    const hover = await provider.provideHover(model, at, NONE as never);
    text += (hover?.contents ?? []).map((part) => part.value).join("\n");
  }
  return text;
}

const timings: string[] = [];
async function timedCompletion(
  model: Monaco.editor.ITextModel,
  at: Monaco.IPosition,
  want: string,
  language: string,
) {
  // 第一次包含线程启动；之后取中位数
  const started = performance.now();
  await until(
    async () => ((await labels(model, at)).includes(want) ? true : undefined),
    `${language} 补全 ${want}`,
  );
  const first = Math.round(performance.now() - started);
  const runs: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    await labels(model, at);
    runs.push(performance.now() - t);
  }
  runs.sort((a, b) => a - b);
  timings.push(
    `${language}: first ${first} ms, median ${Math.round(runs[3] ?? 0)} ms, max ${Math.round(runs[6] ?? 0)} ms`,
  );
}

describe("CSS、HTML、JSON 的语言服务", () => {
  it("CSS：补全属性名、悬停有说明、不认识的属性有校验提示", async () => {
    const model = open("css", ".card {\n  col\n}\n", "src/a.css");
    await timedCompletion(model, { lineNumber: 2, column: 6 }, "color", "css");
    const bad = open("css", ".card {\n  colr: red;\n}\n", "src/b.css");
    const good = open("css", ".card {\n  color: red;\n}\n", "src/c.css");
    const hover = await until(async () => {
      const text = await hoverText(good, { lineNumber: 2, column: 4 });
      return text === "" ? undefined : text;
    }, "CSS 悬停");
    expect(hover.toLowerCase()).toContain("color");
    const markers = await until(async () => {
      const found = runtime.monaco.editor.getModelMarkers({ resource: bad.uri });
      return found.length > 0 ? found : undefined;
    }, "CSS 校验");
    expect(markers[0]?.message).toContain("colr");
    expect(runtime.monaco.editor.getModelMarkers({ resource: good.uri })).toEqual([]);
  });

  it("HTML：补全标签、悬停有说明", async () => {
    const model = open("html", "<main>\n  <di\n</main>\n", "src/a.html");
    await timedCompletion(model, { lineNumber: 2, column: 6 }, "div", "html");
    const hover = await until(async () => {
      const text = await hoverText(model, { lineNumber: 1, column: 3 });
      return text === "" ? undefined : text;
    }, "HTML 悬停");
    expect(hover.toLowerCase()).toContain("main");
  });

  it("JSON：补全键名、语法错误有校验提示，着色仍是 Shiki 的", async () => {
    // 没有 JSON Schema 时能补全的是键名（含 $schema）；悬停要有 Schema 才有内容，所以不测
    const model = open("json", '{ "": 1 }\n', "src/a.json");
    await timedCompletion(model, { lineNumber: 1, column: 4 }, "$schema", "json");
    const bad = open("json", '{ "a": 1, }\n', "src/b.json");
    const markers = await until(async () => {
      const found = runtime.monaco.editor.getModelMarkers({ resource: bad.uri });
      return found.length > 0 ? found : undefined;
    }, "JSON 校验");
    expect(markers[0]?.message.length).toBeGreaterThan(0);
    // JSON 语言服务自带的着色器会把记号换成 string.key.json 之类；我们关了它，仍用 Shiki
    const kinds = new Set(
      runtime.monaco.editor
        .tokenize('{ "name": "demo", "n": 1, "ok": true }', "json")
        .flat()
        .map((t) => t.type),
    );
    expect([...kinds].some((kind) => kind.endsWith(".json"))).toBe(false);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  it("记下每种语言的补全耗时", () => {
    process.stderr.write(`TIMING ${timings.join(" | ")}\n`);
    expect(timings.length).toBeGreaterThan(0);
  });
});
