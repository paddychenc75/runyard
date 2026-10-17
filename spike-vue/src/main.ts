import "./monaco-features";
import * as monaco from "monaco-editor/editor/editor.api.js";
import { activateMarkers, registerProviders } from "@volar/monaco";

const W: any = window;
const R: any = (W.__vue = { done: false, log: [] as string[], t: {} as Record<string, number> });
window.addEventListener("error", (e: any) => { (R.winErrors ??= []).push(String(e.error?.stack ?? e.message).slice(0, 700)); });
window.addEventListener("unhandledrejection", (e: any) => { (R.winErrors ??= []).push("REJ " + String(e.reason?.stack ?? e.reason).slice(0, 700)); });
const log = (s: string) => { R.log.push(s); };
const now = () => performance.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(self as any).MonacoEnvironment = { getWorker: () => new Worker("app://runyard/workers/editor.worker.js") };
monaco.languages.register({ id: "vue", extensions: [".vue"] });

const CHILD = `<script setup lang="ts">
defineProps<{ title: string; count?: number; /** 是否高亮 */ highlighted?: boolean }>()
defineEmits<{ (e: 'select', id: number): void }>()
</script>

<template>
  <div>{{ title }} {{ count }}</div>
</template>
`;
const APP = `<script setup lang="ts">
import { ref, computed } from 'vue'
import Child from './components/Child.vue'

const n = ref(1)
const doubled = computed(() => n.value * 2)
const label: string = 42
//SCRIPT_MARK
</script>

<template>
  <Child title="a" :count="'x'" />
  <Child :count="3" />
  <Child title="ok" @select="(id) => (n = id)" />
  <p>{{ doubled }}</p>
  <p>{{ nope }}</p>
  <!--MARK-->
</template>
`;
(async () => {
try {
const el = document.getElementById("root")!; el.style.cssText = "width:900px;height:600px";
const T0 = now();
const mk = (path: string, text: string) => monaco.editor.createModel(text, "vue", monaco.Uri.file(path));
const child = mk("/proj/src/components/Child.vue", CHILD);
const app = mk("/proj/src/App.vue", APP);
const editor = monaco.editor.create(el, { model: app, wordBasedSuggestions: "off", quickSuggestions: false, automaticLayout: true, fixedOverflowWidgets: true });
R.t.editorCreated = now() - T0;
let opened: string[] = [];
monaco.editor.registerEditorOpener({ openCodeEditor(_s: any, resource: any) { opened.push(resource.toString()); return true; } } as any);

if (location.search.includes("novue")) { await sleep(1500); R.pageHeapMB = Math.round((performance as any).memory.usedJSHeapSize / 1e5) / 10; R.novue = true; R.done = true; return; }
const tw = now();
monaco.editor.onDidChangeMarkers(() => { if (R.t.firstMarkers === undefined && monaco.editor.getModelMarkers({ resource: app.uri }).length) R.t.firstMarkers = now() - tw; });
const rawWorker = new Worker("app://runyard/workers/vue.worker.js"); rawWorker.postMessage("ignore"); rawWorker.postMessage({});
const worker = monaco.editor.createWebWorker<any>({ worker: rawWorker, host: {} });
const getUris = () => monaco.editor.getModels().map((m) => m.uri);
activateMarkers(worker as any, ["vue"], "vue", getUris as any, monaco.editor as any);
R.step='registerProviders';
await registerProviders(worker as any, ["vue"], getUris as any, monaco.languages as any);
R.step='registered';R.t.workerRegistered = now() - tw;

R.step='sync';const proxy: any = await worker.withSyncedResources(getUris());
let rid = 1000;

async function suggest(label: string, p: { lineNumber: number; column: number }) {
  R.step = 'suggest ' + label;
  editor.setPosition(p); editor.focus();
  const t = now();
  editor.trigger("t", "editor.action.triggerSuggest", {});
  let items: string[] = [];
  for (let i = 0; i < 400; i++) {
    await sleep(5);
    const w = document.querySelector(".suggest-widget.visible");
    if (w) { items = [...w.querySelectorAll(".monaco-list-row")].map((r) => (r.getAttribute("aria-label") ?? r.textContent ?? "").trim()); if (items.length) break; }
  }
  const ms = now() - t;
  editor.trigger("t", "hideSuggestWidget", {});
  await sleep(50);
  R[label] = { ms: Math.round(ms), n: items.length, items: items.slice(0, 40) };
}
const raw = async (name: string, f: () => Promise<any>) => { R.step = "raw " + name; const t = now(); const r = await f(); R[name] = { ms: Math.round(now() - t), r }; return r; };
// 在标记处临时写入一段文字，把光标放到末尾，请求提示，再还原
async function typed(label: string, markerText: string, insert: string) {
  const full = app.getValue(); const idx = full.indexOf(markerText);
  const start = app.getPositionAt(idx); const end = app.getPositionAt(idx + markerText.length);
  app.applyEdits([{ range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: insert }]);
  const cursor = app.getPositionAt(idx + insert.length);
  await suggest(label, { lineNumber: cursor.lineNumber, column: cursor.column });
  const s2 = app.getPositionAt(idx), e2 = app.getPositionAt(idx + insert.length);
  app.applyEdits([{ range: new monaco.Range(s2.lineNumber, s2.column, e2.lineNumber, e2.column), text: markerText }]);
}
const t1 = now(); await typed("suggest_1_firstEver_props", "<!--MARK-->", "<Child "); R.firstEverMs = Math.round(now() - t1);
await typed("suggest_componentName", "<!--MARK-->", "<Chi");
await typed("suggest_props_again", "<!--MARK-->", "<Child :c");
await typed("suggest_eventsAndDirectives", "<!--MARK-->", "<Child @");
await typed("suggest_scriptSetup_member", "//SCRIPT_MARK", "n.");
await typed("suggest_template_expr", "<!--MARK-->", "<p>{{ doubled.");
await typed("suggest_import_path", "//SCRIPT_MARK", "import X from './comp");
const lines = app.getValue().split("\n");
const pos = (needle: string, d = 0) => { for (let i = 0; i < lines.length; i++) { const c = lines[i].indexOf(needle); if (c >= 0) return { lineNumber: i + 1, column: c + d + 1 }; } throw new Error(needle); };
const lsp = (p: { lineNumber: number; column: number }) => ({ line: p.lineNumber - 1, character: p.column - 1 });
{ const full0 = app.getValue(); const off = full0.indexOf("<Child title=\"a\"") + 7 - (full0.indexOf("<template>") + "<template>".length); await raw("debug_props", () => proxy.debugProps("/proj/src/App.vue", off - 0)); }
await raw("hover_n", () => proxy.getHover(++rid, app.uri, lsp(pos("const n", 6))));
await raw("hover_doubled", () => proxy.getHover(++rid, app.uri, lsp(pos("const doubled", 8))));
await raw("hover_childProp_template", () => proxy.getHover(++rid, app.uri, lsp(pos("title=\"a\"", 2))));
await raw("hover_childTag_template", () => proxy.getHover(++rid, app.uri, lsp(pos("<Child title=\"a\"", 2))));
await raw("def_import", () => proxy.getDefinition(++rid, app.uri, lsp(pos("import Child", 8))));
await raw("def_tag", () => proxy.getDefinition(++rid, app.uri, lsp(pos("<Child title=\"a\"", 2))));
await raw("def_prop_template", () => proxy.getDefinition(++rid, app.uri, lsp(pos("title=\"a\"", 2))));
await raw("def_scriptVar_inTemplate", () => proxy.getDefinition(++rid, app.uri, lsp(pos("{{ doubled", 4))));
// 定义跳转走 Monaco 的界面路径
editor.setPosition(pos("import Child", 8)); editor.focus(); opened = [];
R.hasRevealAction = !!editor.getAction("editor.action.revealDefinition"); editor.trigger("t", "editor.action.revealDefinition", {}); await sleep(600);
R.ui_revealDefinition = opened;
// 报错：Monaco 的标记
for (let i = 0; i < 100; i++) { if (monaco.editor.getModelMarkers({ resource: app.uri }).length) break; await sleep(50); }
await sleep(800);
R.markers = monaco.editor.getModelMarkers({ resource: app.uri }).map((m) => `${m.startLineNumber}:${m.startColumn} ${m.code && (m.code as any).value || m.code} ${m.message.replace(/\n/g, " ").slice(0, 120)}`);
R.t.total = now() - T0;
// 内存：JS 堆（页面）
R.pageHeapMB = Math.round((performance as any).memory.usedJSHeapSize / 1e5) / 10;
R.done = true;
} catch (e: any) { R.error = String(e?.stack ?? e); R.done = true; }
})();
