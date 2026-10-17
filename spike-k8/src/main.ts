// K8 spike renderer: loaded in the packaged app instead of the real UI. Not shipped.
import "./nonce.ts";
import "./monaco-features.ts";
import * as tsApi from "monaco-editor/languages/features/typescript/register.js";
import * as monaco from "monaco-editor/editor/editor.api.js";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { shikiToMonaco } from "@shikijs/monaco";
import langTs from "shiki/langs/typescript.mjs";
import langTsx from "shiki/langs/tsx.mjs";
import langJs from "shiki/langs/javascript.mjs";
import langJsx from "shiki/langs/jsx.mjs";
import langVue from "shiki/langs/vue.mjs";
import langCss from "shiki/langs/css.mjs";
import langHtml from "shiki/langs/html.mjs";
import langJson from "shiki/langs/json.mjs";
import langMd from "shiki/langs/markdown.mjs";
import langPy from "shiki/langs/python.mjs";
import langGo from "shiki/langs/go.mjs";
import themeLight from "shiki/themes/github-light.mjs";
import themeDark from "shiki/themes/github-dark.mjs";

const W = (name: string) => new Worker(`app://runyard/workers/${name}.js`);
(self as any).MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === "typescript" || label === "javascript") return W("ts.worker");
    if (label === "css" || label === "scss" || label === "less") return W("css.worker");
    if (label === "html") return W("html.worker");
    if (label === "json") return W("json.worker");
    return W("editor.worker");
  },
};

const R: Record<string, unknown> = {};
(window as any).__k8 = R;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frames = (n: number) =>
  new Promise<void>((res) => {
    const step = () => (n-- <= 0 ? res() : requestAnimationFrame(step));
    step();
  });

const VUE = `<script setup lang="ts">
import { ref, computed } from 'vue'
const count = ref<number>(0)
const double = computed(() => count.value * 2) // doubled
</script>

<template>
  <button class="btn" @click="count++">{{ count }} x2={{ double }}</button>
</template>

<style scoped>
.btn { color: #42b883; padding: 4px 8px; }
</style>
`;
const SAMPLES: Record<string, [string, string, string?]> = {
  typescript: ["file:///p/a.ts", `// comment\nimport { x } from "./y";\nexport const n: number = 42;\nfunction f(a: string) { return \`t\${a}\`; }\n`],
  tsx: ["file:///p/a.tsx", `// comment\nimport React from "react";\nexport const A = () => <div className="a">{"s"}</div>;\n`],
  javascript: ["file:///p/a.js", `// comment\nconst s = 'str'; function g() { return 1; }\n`],
  jsx: ["file:///p/a.jsx", `// comment\nexport const B = () => <p id="b">hi</p>;\n`],
  vue: ["file:///p/App.vue", VUE],
  css: ["file:///p/a.css", `/* c */\n.a { color: red; margin: 0 auto; }\n`],
  html: ["file:///p/a.html", `<!-- c -->\n<div class="x" id="y">text</div>\n<script>const a = 1;</script>\n`],
  json: ["file:///p/a.json", `{ "a": 1, "b": "s", "c": [true, null] }\n`],
  markdown: ["file:///p/a.md", `# Title\n\n**bold** and \`code\`\n\n- item\n\n\`\`\`ts\nconst z = 1;\n\`\`\`\n`],
  python: ["file:///p/a.py", `# comment\ndef f(a: int) -> str:\n    return "s" + str(a)\n`],
  go: ["file:///p/a.go", `// comment\npackage main\nfunc main() { s := "x"; _ = s }\n`],
};

async function run() {
  const t0 = performance.now();
  // ---- Shiki with JS regex engine ----
  let highlighter: any;
  try {
    const ts = performance.now();
    highlighter = await createHighlighterCore({
      themes: [themeLight, themeDark],
      langs: [langTs, langTsx, langJs, langJsx, langVue, langCss, langHtml, langJson, langMd, langPy, langGo],
      // strict: throw if a grammar pattern cannot be translated to a JS regex
      engine: createJavaScriptRegexEngine({ forgiving: false } as any),
    });
    R.shikiInitMs = Math.round(performance.now() - ts);
    R.shikiLoadedLangs = highlighter.getLoadedLanguages().length;
  } catch (e) {
    R.shikiError = String(e);
    throw e;
  }
  for (const id of ["typescript", "javascript", "vue", "css", "html", "json", "markdown", "python", "go"]) {
    if (!monaco.languages.getLanguages().some((l) => l.id === id)) monaco.languages.register({ id });
  }
  shikiToMonaco(highlighter, monaco);
  // .tsx/.jsx share Monaco ids typescript/javascript (the TS services only attach to those two ids), so
  // the 'typescript' id is tokenized with the TSX grammar by a second, tiny highlighter
  const hlTsx = await createHighlighterCore({ themes: [themeLight, themeDark], langs: [{ ...(langTsx as any)[0], name: "typescript", aliases: [] }], engine: createJavaScriptRegexEngine({ forgiving: false } as any) });
  shikiToMonaco(hlTsx, monaco);
  R.registered = monaco.languages.getLanguages().map((l) => l.id).filter((i) => ["typescript","javascript","vue","json","css","html","markdown","python","go","typescriptreact","javascriptreact"].includes(i));

  // ---- editor ----
  const host = document.getElementById("root")!;
  host.style.cssText = "position:fixed;inset:0;display:grid;grid-template-rows:1fr";
  const box = document.createElement("div");
  box.style.cssText = "width:100%;height:100%";
  host.appendChild(box);
  monaco.editor.setTheme("github-light");
  const editor = monaco.editor.create(box, { automaticLayout: true, model: null, minimap: { enabled: false }, fontSize: 14 });
  R.editorCreated = true;
  R.editorReadyFromNavStartMs = Math.round(performance.now());

  // ---- tokens per language via Shiki (JS engine) ----
  const tokenReport: Record<string, unknown> = {};
  const colorsOnPage = async (model: monaco.editor.ITextModel) => {
    editor.setModel(model);
    await frames(3); await sleep(150);
    const lines = Array.from(document.querySelectorAll(".view-line"));
    const per: string[][] = lines.map((l) => Array.from(l.querySelectorAll("span > span")).map((s) => getComputedStyle(s as HTMLElement).color));
    const all = new Set(per.flat());
    return { lines: lines.length, distinctColors: all.size, perLine: per.map((c) => new Set(c).size) };
  };
  const monacoLang = (k: string) => (k === "tsx" ? "typescript" : k === "jsx" ? "javascript" : k);
  for (const [lang, [uri, text]] of Object.entries(SAMPLES)) {
    const model = monaco.editor.createModel(text, monacoLang(lang), monaco.Uri.parse(uri));
    const direct = highlighter.codeToTokensBase(text, { lang, theme: "github-light" });
    const dcolors = new Set(direct.flat().map((t: any) => t.color));
    tokenReport[lang] = { shikiDistinctColors: dcolors.size, dom: await colorsOnPage(model) };
  }
  R.tokenReport = tokenReport;
  {
    const ex = (lang: string, code: string, find: string) => { const t = highlighter.codeToTokens(code, { lang, theme: "github-light", includeExplanation: "scopeName" }).tokens.flat().find((x: any) => x.content === find); return t ? { content: t.content, scopes: t.explanation?.[0]?.scopes?.slice(-2).map((x: any) => x.scopeName) } : null; };
    R.jsxInJavascriptGrammar = ex("javascript", SAMPLES.jsx[1], "p");
    R.jsxInTsxGrammar = ex("tsx", SAMPLES.tsx[1], "div");
  }

  // ---- Vue: three sections, via explain ----
  {
    const explained = highlighter.codeToTokens(VUE, { lang: "vue", theme: "github-light", includeExplanation: "scopeName" });
    const flat = explained.tokens.flat();
    const find = (s: string) => {
      const t = flat.find((x: any) => x.content.includes(s));
      return t ? { content: t.content, color: t.color, scopes: t.explanation?.[0]?.scopes?.slice(-2).map((x: any) => x.scopeName) } : null;
    };
    const tpl = flat.filter((t: any) => t.explanation?.some((e: any) => e.scopes.some((s: any) => /html|vue/.test(s.scopeName)))).length;
    R.vueSections = {
      templateTag: find("button"), templateAttr: find("class"), templateString: find('"btn"'),
      scriptKeyword: find("import"), scriptConst: find("const"), scriptType: find("number"),
      styleProp: find("color"), styleValue: find("#42b883"), styleSelector: find(".btn"),
      templateTokens: tpl,
    };
  }

  // ---- theme switching ----
  {
    const vueModel = monaco.editor.getModels().find((m) => m.uri.path.endsWith("App.vue"))!;
    editor.setModel(vueModel);
    editor.setPosition({ lineNumber: 3, column: 5 });
    editor.revealLine(3);
    const bg = () => getComputedStyle(document.querySelector(".monaco-editor-background") as HTMLElement).backgroundColor;
    const light = bg();
    const ts = performance.now();
    monaco.editor.setTheme("github-dark");
    await frames(2);
    const dark = bg();
    R.theme = { light, dark, changed: light !== dark, switchMs: Math.round(performance.now() - ts), positionKept: JSON.stringify(editor.getPosition()), sameModel: editor.getModel() === vueModel };
    monaco.editor.setTheme("github-light");
  }

  // ---- TS IntelliSense ----
  const tsd = tsApi.typescriptDefaults;
  const opts = {
    target: tsApi.ScriptTarget.ESNext,
    module: tsApi.ModuleKind.ESNext,
    moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
    jsx: tsApi.JsxEmit.ReactJSX,
    allowNonTsExtensions: true, allowJs: true, noEmit: true, strict: true,
  };
  tsd.setCompilerOptions(opts);
  tsApi.javascriptDefaults.setCompilerOptions(opts);
  tsd.setEagerModelSync(true);
  const ignore = [2307, 2792, 7016, 7026, 2875];
  tsd.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: ignore });

  const math = monaco.editor.createModel(`export function addTwo(a: number, b: number): number {\n  return a + b;\n}\n`, "typescript", monaco.Uri.parse("file:///proj/src/math.ts"));
  const appSrc = `import { useState } from "react";\nimport { addTwo } from "./math";\nconst r = addTwo(1, 2);\nconst bad: number = "a";\naddT\nexport const App = () => <div>{r}</div>;\n`;
  const app = monaco.editor.createModel(appSrc, "typescript", monaco.Uri.parse("file:///proj/src/App.tsx"));
  editor.setModel(app);
  await frames(2);
  const getW = await tsApi.getTypeScriptWorker();
  const t1 = performance.now();
  const w = await getW(app.uri);
  const uri = app.uri.toString();
  const off = (needle: string, delta = 0) => app.getOffsetAt(app.getPositionAt(appSrc.indexOf(needle) + delta));
  const comp = await w.getCompletionsAtPosition(uri, appSrc.indexOf("addT\n") + 4);
  R.tsFirstWorkerCallMs = Math.round(performance.now() - t1);
  const addTwoEntry = comp?.entries?.find((e: any) => e.name === "addTwo");
  const detail = addTwoEntry ? await w.getCompletionEntryDetails(uri, appSrc.indexOf("addT\n") + 4, "addTwo") : null;
  R.tsCompletion = { found: !!addTwoEntry, signature: detail?.displayParts?.map((p: any) => p.text).join("") };
  const defs = await w.getDefinitionAtPosition(uri, appSrc.indexOf("addTwo(1") + 2);
  R.tsDefinition = defs?.map((d: any) => ({ file: d.fileName, start: d.textSpan.start }));
  const rename = await w.findRenameLocations(uri, appSrc.indexOf("addTwo(1") + 2, false, false, {});
  R.tsRename = rename?.map((d: any) => d.fileName);
  const markersOf = (m: monaco.editor.ITextModel) => monaco.editor.getModelMarkers({ resource: m.uri }).map((x) => ({ code: (x.code as any)?.value ?? x.code, msg: x.message.slice(0, 80), line: x.startLineNumber }));
  const sem = await w.getSemanticDiagnostics(uri);
  R.tsSemanticDiagnostics = sem.map((d: any) => ({ code: d.code, text: typeof d.messageText === "string" ? d.messageText : d.messageText.messageText }));
  await sleep(1500);
  R.tsMarkersApp = markersOf(app);
  R.tsDiagnosticsWithoutIgnore = await (async () => {
    tsd.setDiagnosticsOptions({ diagnosticCodesToIgnore: [] });
    await sleep(1200);
    const m = markersOf(app);
    tsd.setDiagnosticsOptions({ diagnosticCodesToIgnore: ignore });
    return m;
  })();
  const step = async (name: string, fn: () => Promise<void>, limit = 30000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout " + limit + "ms")), limit))]); } catch (e) { (R.stepErrors ??= {} as any)[name] = String((e as any)?.stack ?? e).slice(0, 300); } };
  // ---- other-file change -> diagnostics of an open file ----
  const original = appSrc.replace("addT\n", "");
  await step("renameOther", async () => {
    app.setValue(original);
    await sleep(1500);
    R.tsBeforeRename = markersOf(app).filter((m) => [2305, 2724, 2551, 2339].includes(Number(m.code)));
    const sumSrc = math.getValue().replace("addTwo", "sum");
    // (a) do nothing: does Monaco revalidate App.tsx when only math.ts changed?
    const t2 = performance.now();
    math.setValue(sumSrc);
    let after: any[] = [];
    for (let k = 0; k < 40; k++) { await sleep(100); after = markersOf(app).filter((m) => m.line === 2); if (after.length) break; }
    R.tsOtherFileAutoRevalidate = { markers: after, waitedMs: Math.round(performance.now() - t2) };
    // (b) nudge: setDiagnosticsOptions fires onDidChange, Monaco revalidates every model
    const t3 = performance.now();
    tsd.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [...ignore] });
    let after2: any[] = [];
    for (let k = 0; k < 40; k++) { await sleep(100); after2 = markersOf(app).filter((m) => m.line === 2); if (after2.length) break; }
    R.tsOtherFileNudge = { markers: after2, latencyMs: Math.round(performance.now() - t3) };
    // (c) own revalidation: ask the worker for diagnostics of every open model after any file changed
    math.setValue(`export function addTwo(a: number, b: number): number {\n  return a + b;\n}\n`);
    tsd.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false, diagnosticCodesToIgnore: [...ignore] });
    await sleep(1500);
    const revalidate = async (m: monaco.editor.ITextModel) => {
      const worker = await (await tsApi.getTypeScriptWorker())(m.uri);
      const diags = (await worker.getSemanticDiagnostics(m.uri.toString())).filter((d: any) => !ignore.includes(d.code));
      monaco.editor.setModelMarkers(m, "k8-sem", diags.map((d: any) => { const a = m.getPositionAt(d.start), b = m.getPositionAt(d.start + d.length); return { severity: monaco.MarkerSeverity.Error, message: typeof d.messageText === "string" ? d.messageText : d.messageText.messageText, code: String(d.code), startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }; }));
    };
    await revalidate(app);
    const semMarks = () => monaco.editor.getModelMarkers({ resource: app.uri, owner: "k8-sem" }).filter((m) => m.startLineNumber === 2);
    const t4 = performance.now();
    math.setValue(sumSrc);
    await revalidate(app);
    R.tsOtherFileCustom = { markers: semMarks().map((m) => m.message.slice(0, 70)), latencyMs: Math.round(performance.now() - t4) };
    math.setValue(`export function addTwo(a: number, b: number): number {\n  return a + b;\n}\n`);
    monaco.editor.setModelMarkers(app, "k8-sem", []);
    tsd.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [...ignore] });
    await sleep(1200);
  });
  // ---- go-to-definition through the UI action (needs an opener: the standalone editor does not switch models by itself) ----
  await step("gotoDef", async () => {
    let opened: any = null;
    const openerDisp = monaco.editor.registerEditorOpener({ openCodeEditor(_src, resource, selection) { opened = { resource: resource.toString(), selection }; return true; } });
    editor.setModel(app);
    editor.setPosition(app.getPositionAt(original.indexOf("addTwo(1") + 2));
    editor.focus();
    R.actionIds = editor.getSupportedActions().map((a) => a.id).filter((id) => /Definition|rename|triggerSuggest|startFind|addSelectionToNext/i.test(id));
    editor.trigger("k8", "editor.action.revealDefinition", {});
    await sleep(1500);
    R.tsGotoDefinitionUi = { opened };
    openerDisp.dispose();
  });
  await step("quickinfo", async () => {
    const wFresh = await getW(app.uri);
    const qi = await wFresh.getQuickInfoAtPosition(app.uri.toString(), original.indexOf("addTwo(1") + 2);
    R.tsQuickInfo = qi?.displayParts?.map((p: any) => p.text).join("");
  });
  R.progress = "after-quickinfo";
  await step("hover", async () => {
    editor.setModel(app);
    const bad = original.indexOf('const bad');
    editor.setPosition(app.getPositionAt(bad + 8));
    editor.focus();
    editor.trigger("k8", "editor.action.showHover", {});
    await sleep(1500);
    R.hoverText = Array.from(document.querySelectorAll(".monaco-hover")).map((e) => e.className + " :: " + (e.textContent ?? "").slice(0, 120)).join(" | ");
  });
  // ---- Vue: no markers, no suggest ----
  await step("vue", async () => {
    const vueModel = monaco.editor.getModels().find((m) => m.uri.path.endsWith("App.vue"))!;
    editor.setModel(vueModel);
    await sleep(1500);
    const probe = async (label: string) => {
      editor.setPosition({ lineNumber: 4, column: 10 });
      editor.focus();
      editor.trigger("k8", "hideSuggestWidget", {});
      await editor.getAction("editor.action.triggerSuggest")?.run();
      await sleep(700);
      const w = document.querySelector(".suggest-widget.visible"); return { label, suggestVisible: !!w, text: (w?.textContent ?? "").slice(0, 60), rows: w ? w.querySelectorAll(".monaco-list-row").length : 0 };
    };
    const before = await probe("defaults");
    editor.updateOptions({ wordBasedSuggestions: "off", quickSuggestions: false, suggestOnTriggerCharacters: false });
    const afterOff = await probe("wordBasedSuggestions off");
    R.vue = { language: vueModel.getLanguageId(), markers: markersOf(vueModel), before, afterOff };
    editor.updateOptions({ wordBasedSuggestions: "matchingDocuments", quickSuggestions: true, suggestOnTriggerCharacters: true });
  });
  // ---- find / replace / multi-cursor ----
  await step("multi", async () => {
    const fm = monaco.editor.createModel("let count = 1;\ncount++;\nconsole.log(count);\n", "typescript", monaco.Uri.parse("file:///proj/src/c.ts"));
    editor.setModel(fm);
    editor.focus();
    editor.setSelection(new monaco.Selection(1, 5, 1, 10));
    editor.trigger("k8", "editor.action.addSelectionToNextFindMatch", null);
    editor.trigger("k8", "editor.action.addSelectionToNextFindMatch", null);
    const nSel = editor.getSelections()!.length;
    editor.trigger("k8", "type", { text: "total" });
    R.multiCursor = { selections: nSel, text: fm.getValue() };
    fm.setValue("let count = 1;\ncount++;\nconsole.log(count);\n");
    const fc: any = editor.getContribution("editor.contrib.findController");
    await fc.start({ forceRevealReplace: true, seedSearchStringFromSelection: "never", seedSearchStringFromNonEmptySelection: false, shouldFocus: 0, shouldAnimate: false, updateSearchScope: false, loop: true }, { searchString: "count", replaceString: "total" });
    await sleep(300);
    fc.replaceAll();
    await sleep(200);
    R.findReplace = { widgetInDom: !!document.querySelector(".find-widget"), text: fm.getValue() };
  });

  await step("completionRepeat", async () => {
    editor.setModel(app);
    const ww = await getW(app.uri);
    const times: number[] = [];
    for (let k = 0; k < 15; k++) { const t = performance.now(); await ww.getCompletionsAtPosition(uri, appSrc.indexOf("addT\n") + 4); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    R.tsCompletionRepeatMs = { median: Math.round(times[7]), max: Math.round(times[14]) };
  });
  await step("project500", async () => {
    if (location.hash === "#light") return;
    const t = performance.now();
    const made: monaco.editor.ITextModel[] = [];
    for (let k = 0; k < 500; k++) {
      const body = Array.from({ length: 30 }, (_, j) => `export function f${k}_${j}(a: number, b: string): string { return b + a + ${j}; }`).join("\n") + (k > 0 ? `\nimport { f${k - 1}_0 } from "./m${k - 1}";\nexport const link${k} = f${k - 1}_0(1, "x");\n` : "\n");
      made.push(monaco.editor.createModel(body, "typescript", monaco.Uri.parse(`file:///proj500/m${k}.ts`)));
    }
    const mainSrc = `import { f499_0 } from "./m499";\nconst r = f499_0(1, "x");\nr.toUpper\nf4`;
    const mm = monaco.editor.createModel(mainSrc, "typescript", monaco.Uri.parse("file:///proj500/main.ts"));
    R.project500CreateModelsMs = Math.round(performance.now() - t);
    const ww = await getW(mm.uri);
    const t1 = performance.now();
    const c1 = await ww.getCompletionsAtPosition(mm.uri.toString(), mainSrc.length);
    R.project500FirstCompletion = { ms: Math.round(performance.now() - t1), entries: c1?.entries?.length ?? 0, hasF499: !!c1?.entries?.some((e: any) => e.name === "f499_0") };
    const times: number[] = [];
    for (let k = 0; k < 10; k++) { const t2 = performance.now(); await ww.getCompletionsAtPosition(mm.uri.toString(), mainSrc.length); times.push(performance.now() - t2); }
    times.sort((a, b) => a - b);
    R.project500CompletionMs = { median: Math.round(times[5]), max: Math.round(times[9]) };
    const t3 = performance.now();
    const sd = await ww.getSemanticDiagnostics(mm.uri.toString());
    R.project500Semantic = { ms: Math.round(performance.now() - t3), count: sd.length };
    // a signature change in the first file, how long until the chain's tail reports it
    const mem = (performance as any).memory?.usedJSHeapSize;
    R.heapAfter500MB = mem ? Math.round(mem / 1048576) : null;
    mm.dispose(); made.forEach((x) => x.dispose());
  }, 90000);
  const mk500 = (k: number) => Array.from({ length: 30 }, (_, j) => `export function f${k}_${j}(a: number, b: string): string { return b + a + ${j}; }`).join("\n") + (k > 0 ? `\nimport { f${k - 1}_0 } from "./m${k - 1}";\nexport const link${k} = f${k - 1}_0(1, "x");\n` : "\n");
  const mainSrc500 = `import { f499_0 } from "./m499";\nconst r = f499_0(1, "x");\nr.toUpper\nf4`;
  const completionStats = async (mm: monaco.editor.ITextModel) => {
    const ww = await getW(mm.uri);
    const t1 = performance.now();
    const c1 = await ww.getCompletionsAtPosition(mm.uri.toString(), mm.getValue().length);
    const first = Math.round(performance.now() - t1);
    const times: number[] = [];
    for (let k = 0; k < 10; k++) { const t2 = performance.now(); await ww.getCompletionsAtPosition(mm.uri.toString(), mm.getValue().length); times.push(performance.now() - t2); }
    times.sort((a, b) => a - b);
    return { firstMs: first, entries: c1?.entries?.length ?? 0, hasF499: !!c1?.entries?.some((e: any) => e.name === "f499_0"), medianMs: Math.round(times[5]), maxMs: Math.round(times[9]) };
  };
  await step("project500NoValidation", async () => {
    if (location.hash === "#light") return;
    tsd.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
    await sleep(500);
    const t = performance.now();
    const made = Array.from({ length: 500 }, (_, k) => monaco.editor.createModel(mk500(k), "typescript", monaco.Uri.parse(`file:///proj500b/m${k}.ts`)));
    const mm = monaco.editor.createModel(mainSrc500, "typescript", monaco.Uri.parse("file:///proj500b/main.ts"));
    const createMs = Math.round(performance.now() - t);
    R.project500NoValidation = { createMs, ...(await completionStats(mm)) };
    mm.dispose(); made.forEach((x) => x.dispose());
    tsd.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [...ignore] });
  }, 120000);
  await step("project500ExtraLibs", async () => {
    if (location.hash === "#light") return;
    tsd.setEagerModelSync(false);
    const t = performance.now();
    const libs = Array.from({ length: 500 }, (_, k) => ({ content: mk500(k), filePath: `file:///proj500c/m${k}.ts` }));
    tsd.setExtraLibs(libs);
    const mm = monaco.editor.createModel(mainSrc500, "typescript", monaco.Uri.parse("file:///proj500c/main.ts"));
    const setMs = Math.round(performance.now() - t);
    R.project500ExtraLibs = { setMs, ...(await completionStats(mm)) };
    // one file changes on disk: replace its extra lib; this fires onDidChange, which restarts the worker
    const t2 = performance.now();
    libs[250] = { content: mk500(250) + "export const extra = 1;\n", filePath: libs[250].filePath };
    tsd.setExtraLibs(libs);
    const ww = await getW(mm.uri);
    await ww.getCompletionsAtPosition(mm.uri.toString(), mm.getValue().length);
    R.project500ExtraLibChangeToFirstCompletionMs = Math.round(performance.now() - t2);
    mm.dispose();
    tsd.setExtraLibs([]);
    tsd.setEagerModelSync(true);
  }, 120000);
  await step("extraLibFlow", async () => {
    // production flow: drop the extra lib of a path BEFORE creating the model for it
    const mathPath = "file:///proj3/src/math.ts";
    tsd.setExtraLibs([{ filePath: mathPath, content: "export function addTwo(a: number, b: number): number { return a + b; }\n" }]);
    const src = 'import { addTwo } from "./math";\naddTwo(1, 2);\n';
    const a = monaco.editor.createModel(src, "typescript", monaco.Uri.parse("file:///proj3/src/App.ts"));
    const d0 = (await (await getW(a.uri)).getSemanticDiagnostics(a.uri.toString())).map((d: any) => d.code);
    tsd.setExtraLibs([]);
    const m = monaco.editor.createModel("export function sum(a: number, b: number): number { return a + b; }\n", "typescript", monaco.Uri.parse(mathPath));
    await sleep(700);
    const t = performance.now();
    const wd = await getW(a.uri);
    const files1 = await wd.getScriptFileNames();
    const d1 = (await wd.getSemanticDiagnostics(a.uri.toString())).map((d: any) => d.code);
    const ms1 = Math.round(performance.now() - t);
    const text1 = await (wd as any).getScriptText?.(mathPath);
    const exp1 = await wd.getCompletionsAtPosition(a.uri.toString(), 10);
    (R as any).extraLibFlowDebug = { files1, text1: text1?.slice(0, 60), modelCount: monaco.editor.getModels().map((x) => x.uri.toString()) };
    const sameWorker = (await getW(a.uri)) === wd;
    m.pushEditOperations([], [{ range: new monaco.Range(1, 1, 1, 1), text: "// bump\n" }], () => null);
    const d1b = (await (await getW(a.uri)).getSemanticDiagnostics(a.uri.toString())).map((d: any) => d.code);
    (R as any).extraLibFlowBump = { sameProxy: sameWorker, afterVersionBump: d1b, modelVersion: m.getVersionId() };
    m.dispose();
    tsd.setExtraLibs([{ filePath: mathPath, content: "export function addTwo(a: number, b: number): number { return a + b; }\n" }]);
    const d2 = (await (await getW(a.uri)).getSemanticDiagnostics(a.uri.toString())).map((d: any) => d.code);
    R.extraLibFlow = { extraLibOnly: d0, afterDropAndModel: d1, afterDropAndModelMs: ms1, afterCloseBackToExtraLib: d2 };
    a.dispose(); tsd.setExtraLibs([]);
  });
  await step("extraLibArchitecture", async () => {
    // production shape: files that are not open are extra libs, open files are models (a model wins over an extra lib of the same path)
    tsd.setEagerModelSync(true);
    const mathPath = "file:///proj2/src/math.ts";
    tsd.setExtraLibs([{ filePath: mathPath, content: "export function addTwo(a: number, b: number): number { return a + b; }\n" }]);
    const src = 'import { addTwo } from "./math";\nconst r: string = addTwo(1, 2);\naddTwo(1, 2);\n';
    const a = monaco.editor.createModel(src, "typescript", monaco.Uri.parse("file:///proj2/src/App.ts"));
    const ww = await getW(a.uri);
    const diag1 = (await ww.getSemanticDiagnostics(a.uri.toString())).map((d: any) => d.code);
    const def = await ww.getDefinitionAtPosition(a.uri.toString(), src.indexOf("addTwo(1") + 1);
    // open math.ts as a model with different content: the model must win
    const m = monaco.editor.createModel("export function sum(a: number, b: number): number { return a + b; }\n", "typescript", monaco.Uri.parse(mathPath));
    await sleep(1500);
    const ww2 = await getW(a.uri);
    const diag2 = (await ww2.getSemanticDiagnostics(a.uri.toString())).map((d: any) => d.code);
    // then drop the extra lib for that path (what the app would do when it opens the file)
    const t5 = performance.now();
    tsd.setExtraLibs([]);
    const ww3 = await getW(a.uri);
    const diag3 = (await ww3.getSemanticDiagnostics(a.uri.toString())).map((d: any) => d.code);
    R.extraLibArchitecture = { diagWithExtraLibOnly: diag1, definitionFile: def?.[0]?.fileName, diagModelPlusExtraLibAfter1500ms: diag2, diagAfterDroppingExtraLib: diag3, dropToDiagMs: Math.round(performance.now() - t5) };
    a.dispose(); m.dispose(); tsd.setExtraLibs([]);
  });
  await step("scroll10k", async () => {
    if (location.hash === "#light") return;
    const text = Array.from({ length: 10000 }, (_, i) => `export function g${i}(a: number): string { const s = "v" + a; return s; } // line ${i}`).join("\n");
    const mm = monaco.editor.createModel(text, "typescript", monaco.Uri.parse("file:///proj/ten.ts"));
    editor.setModel(mm);
    await frames(5);
    const deltas: number[] = [];
    let last = performance.now();
    const total = editor.getScrollHeight();
    for (let k = 0; k < 240; k++) {
      editor.setScrollTop((total * k) / 240);
      await frames(1);
      const now = performance.now(); deltas.push(now - last); last = now;
    }
    deltas.sort((a, b) => a - b);
    R.scroll10kFrameMs = { median: +deltas[120].toFixed(1), p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(1), max: +deltas[deltas.length - 1].toFixed(1), frames: deltas.length };
    editor.setModel(null); mm.dispose();
  }, 60000);
  await step("nls", async () => {
    const m = monaco.editor.createModel("hello\n", "typescript", monaco.Uri.parse("file:///proj/nls.ts"));
    editor.setModel(m); editor.focus();
    await editor.getAction("actions.find")?.run();
    await frames(3);
    const texts = Array.from(document.querySelectorAll(".find-widget [aria-label], .find-widget [title], .find-widget textarea")).map((e) => (e.getAttribute("aria-label") || e.getAttribute("title") || (e as HTMLTextAreaElement).placeholder || "").trim()).filter(Boolean);
    const acts = editor.getSupportedActions().filter((a) => ["actions.find", "editor.action.startFindReplace", "editor.action.rename", "editor.action.formatDocument", "editor.action.quickCommand"].includes(a.id)).map((a) => a.id + "=" + a.label);
    R.nlsSample = { language: (globalThis as any)._VSCODE_NLS_LANGUAGE ?? null, messages: ((globalThis as any)._VSCODE_NLS_MESSAGES ?? []).length, findWidget: texts.slice(0, 8), actions: acts };
    editor.trigger("k8", "closeFindWidget", {});
    editor.setModel(null); m.dispose();
  });
  await step("eol", async () => {
    const cases: Record<string, string> = { lf: "a\nb\nc\n", crlf: "a\r\nb\r\nc\r\n", mixed: "a\r\nb\nc\r\n", noTrailing: "a\r\nb", bom: "\uFEFFa\nb\n" };
    const out: Record<string, unknown> = {};
    for (const [k, text] of Object.entries(cases)) {
      const m = monaco.editor.createModel(text, "typescript");
      const back = m.getValue(monaco.editor.EndOfLinePreference.TextDefined);
      out[k] = { eol: JSON.stringify(m.getEOL()), roundTrip: back === text };
      m.dispose();
    }
    // rename of a file with unsaved edits: a model URI cannot change, so a new model takes over the content
    const a = monaco.editor.createModel("let x = 1;\n", "typescript", monaco.Uri.parse("file:///proj/old.ts"));
    a.pushEditOperations([], [{ range: new monaco.Range(1, 5, 1, 6), text: "y" }], () => null);
    const b = monaco.editor.createModel(a.getValue(), "typescript", monaco.Uri.parse("file:///proj/new.ts"));
    out.rename = { unsavedText: b.getValue(), oldUriStillRegistered: !!monaco.editor.getModel(a.uri) };
    a.dispose(); b.dispose();
    R.eol = out;
  });
  await step("curve", async () => {
    if (location.hash === "#light") return;
    const unit = `export function fnX(a: number, b: string): string { const x = \`v\${a}\`; // comment\n  return x + b + "literal";\n}\n`;
    const curve: Record<string, number> = {};
    for (const kb of [100, 500, 1000, 2000]) {
      const text = unit.repeat(Math.ceil((kb * 1000) / unit.length));
      const mm = monaco.editor.createModel(text, "typescript", monaco.Uri.parse(`file:///proj/c${kb}.ts`));
      const t = performance.now();
      mm.tokenization.forceTokenization(mm.getLineCount());
      curve[`${kb}KB`] = Math.round(performance.now() - t);
      mm.dispose();
    }
    R.tokenizeWholeFileMsBySize = curve;
  }, 60000);
  // ---- big file ----
  await step("big", async () => {
    if (location.hash === "#light") return;
    const line = (i: number) => `export function fn${i}(a: number, b: string): string { const x = \`v\${a}\`; // comment ${i}\n  return x + b + "literal ${i}";\n}\n`;
    const parts: string[] = [];
    let size = 0, i = 0;
    while (size < 4_900_000) { const l = line(i++); parts.push(l); size += l.length; }
    const big = parts.join("");
    R.bigFile = { chars: big.length, lines: big.split("\n").length };
    const tm = performance.now();
    const m = monaco.editor.createModel(big, "typescript", monaco.Uri.parse("file:///proj/big.ts"));
    R.bigCreateModelMs = Math.round(performance.now() - tm);
    const tp = performance.now();
    editor.setModel(m);
    let firstPaintMs = -1;
    for (let k = 0; k < 600; k++) {
      await frames(1);
      const spans = Array.from(document.querySelectorAll(".view-line")[1]?.querySelectorAll("span > span") ?? []);
      if (new Set(spans.map((s) => getComputedStyle(s as HTMLElement).color)).size > 1) { firstPaintMs = Math.round(performance.now() - tp); break; }
    }
    {
      const m2 = monaco.editor.createModel(big, "typescript", monaco.Uri.parse("file:///proj/big2.ts"));
      editor.setModel(m2);
      await frames(2);
      const tj = performance.now();
      editor.revealLine(m2.getLineCount() - 5);
      let endPaintMs = -1;
      for (let k = 0; k < 2000; k++) {
        await frames(1);
        const spans = Array.from(document.querySelectorAll(".view-line")[1]?.querySelectorAll("span > span") ?? []);
        if (new Set(spans.map((s) => getComputedStyle(s as HTMLElement).color)).size > 1) { endPaintMs = Math.round(performance.now() - tj); break; }
      }
      R.bigJumpToEndColoredMs = endPaintMs;
      editor.setModel(m);
      m2.dispose();
    }
    const tf = performance.now();
    m.tokenization.forceTokenization(m.getLineCount());
    R.bigFileHighlight = { firstColoredPaintMs: firstPaintMs, forceTokenizeWholeFileMs: Math.round(performance.now() - tf) };
    const ts2 = performance.now();
    editor.revealLine(m.getLineCount() - 5);
    await frames(2);
    R.bigFileScrollEndMs = Math.round(performance.now() - ts2);
    const tw = performance.now();
    const w2 = await getW(m.uri);
    await w2.getSyntacticDiagnostics(m.uri.toString());
    R.bigFileTsSyntacticMs = Math.round(performance.now() - tw);
    const tc = performance.now();
    await w2.getCompletionsAtPosition(m.uri.toString(), 100);
    R.bigFileTsCompletionMs = Math.round(performance.now() - tc);
    editor.setModel(null);
    m.dispose();
  }, 150000);

  R.totalMs = Math.round(performance.now() - t0);
  R.done = true;
}
run().catch((e) => { R.error = String((e && e.stack) || e); R.done = true; });
