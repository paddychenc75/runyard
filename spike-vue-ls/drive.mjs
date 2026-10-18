// 一次性验证脚本：把官方 Vue 语言服务器和带 @vue/typescript-plugin 的 tsserver 当子进程起来，
// 自己当客户端（相当于将来的桥），量功能、耗时、内存、网络。
// 用法：node drive.mjs <serverDir> <projDir> [--permission]
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [serverDir, projDir] = process.argv.slice(2);
const usePerm = process.argv.includes("--permission");
const tsLib = join(serverDir, "node_modules/typescript/lib");
const T0 = performance.now();
setTimeout(() => { console.error("[timeout]"); tss.kill(); vls.kill(); process.exit(2); }, 120000).unref?.();
const ms = () => Math.round(performance.now() - T0);
const log = (...a) => console.log(`[${ms()}ms]`, ...a);

const permArgs = usePerm
  ? ["--permission", `--allow-fs-read=${serverDir}`, `--allow-fs-read=${projDir}`, `--allow-fs-read=${process.env.PROBE ?? serverDir}`, "--require", join(serverDir, "net-guard.cjs")]
  : [];

// ---------- tsserver ----------
const tss = spawn(
  process.execPath,
  [
    ...permArgs,
    join(tsLib, "tsserver.js"),
    "--globalPlugins", "@vue/typescript-plugin",
    "--pluginProbeLocations", process.env.PROBE ?? serverDir,
    "--disableAutomaticTypingAcquisition",
    "--suppressDiagnosticEvents",
    "--locale", "en",
  ],
  { stdio: ["pipe", "pipe", "pipe"], cwd: projDir },
);
tss.stderr.on("data", (d) => process.stderr.write(`[tss err] ${d}`));
let tssSeq = 0;
const tssWait = new Map();
let tssBuf = Buffer.alloc(0);
tss.stdout.on("data", (chunk) => {
  tssBuf = Buffer.concat([tssBuf, chunk]);
  for (;;) {
    const s = tssBuf.toString("latin1");
    const m = /Content-Length: (\d+)\r\n\r\n/.exec(s);
    if (!m) return;
    const start = m.index + m[0].length;
    const len = Number(m[1]);
    if (tssBuf.length < start + len) return;
    const msg = JSON.parse(tssBuf.subarray(start, start + len).toString("utf8"));
    tssBuf = tssBuf.subarray(start + len);
    if (msg.type === "response" && tssWait.has(msg.request_seq)) {
      tssWait.get(msg.request_seq)(msg);
      tssWait.delete(msg.request_seq);
    }
  }
});
function tsReq(command, args) {
  const seq = ++tssSeq;
  tss.stdin.write(`${JSON.stringify({ seq, type: "request", command, arguments: args })}\n`);
  return new Promise((r) => tssWait.set(seq, r));
}

// ---------- vue language server ----------
const vls = spawn(
  process.execPath,
  [
    ...permArgs,
    join(serverDir, "node_modules/@vue/language-server/bin/vue-language-server.js"),
    "--stdio",
    `--tsdk=${tsLib}`,
  ],
  { stdio: ["pipe", "pipe", "pipe"], cwd: projDir },
);
vls.on("exit", (c) => { console.error("[vls exit]", c); tss.kill(); process.exit(1); });
vls.stderr.on("data", (d) => process.stderr.write(`[vls err] ${d}`));
let lspId = 0;
const lspWait = new Map();
let vBuf = Buffer.alloc(0);
const notifications = [];
function lspSend(obj) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...obj }), "utf8");
  vls.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  vls.stdin.write(body);
}
let relayCount = 0;
vls.stdout.on("data", (chunk) => {
  vBuf = Buffer.concat([vBuf, chunk]);
  for (;;) {
    const s = vBuf.toString("latin1");
    const m = /Content-Length: (\d+)\r\n\r\n/.exec(s);
    if (!m) return;
    const start = m.index + m[0].length;
    const len = Number(m[1]);
    if (vBuf.length < start + len) return;
    const msg = JSON.parse(vBuf.subarray(start, start + len).toString("utf8"));
    vBuf = vBuf.subarray(start + len);
    if (msg.id !== undefined && msg.method) {
      // 服务器发来的请求（注册能力、取配置等），一律给个空答复
      lspSend({ id: msg.id, result: msg.method === "workspace/configuration" ? msg.params.items.map(() => null) : null });
    } else if (msg.id !== undefined && lspWait.has(msg.id)) {
      lspWait.get(msg.id)(msg);
      lspWait.delete(msg.id);
    } else if (msg.method === "tsserver/request") {
      // 混合模式：Vue 服务器要 tsserver 的结果，由客户端转发
      if (process.env.DBG) console.error("[raw]", JSON.stringify(msg.params).slice(0, 200));
      const [id, command, args] = Array.isArray(msg.params[0]) ? msg.params[0] : msg.params;
      relayCount++;
      tsReq(command, args).then((res) => {
        if (process.env.DBG) console.error("[relay]", command, res.success, res.message ?? "", JSON.stringify(res.body ?? null).slice(0, 160));
        lspSend({ method: "tsserver/response", params: [[id, res.body]] });
      });
    } else if (msg.method) {
      notifications.push(msg);
    }
  }
});
function lsp(method, params) {
  const id = ++lspId;
  lspSend({ id, method, params });
  return new Promise((r) => lspWait.set(id, r));
}
const notify = (method, params) => lspSend({ method, params });

// ---------- 场景 ----------
const useFile = join(projDir, "src/Use.vue");
const useUri = pathToFileURL(useFile).href;
let text = readFileSync(useFile, "utf8");
let version = 1;
function posOf(needle, extra = 0, from = "last") {
  const i = from === "last" ? text.lastIndexOf(needle) : text.indexOf(needle);
  const off = i + extra;
  const before = text.slice(0, off).split("\n");
  return { line: before.length - 1, character: before.at(-1).length };
}
async function setText(newText) {
  text = newText;
  version++;
  notify("textDocument/didChange", { textDocument: { uri: useUri, version }, contentChanges: [{ text }] });
  await tsReq("updateOpen", { changedFiles: [{ fileName: useFile, textChanges: [{ start: { line: 1, offset: 1 }, end: { line: 9999, offset: 1 }, newText: text }] }] });
}
// tsserver 的 1 基位置
const tsPos = (p) => ({ line: p.line + 1, offset: p.character + 1 });
const pidRss = (pid) => Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString().trim()) / 1024;
const sockets = (pid) => {
  try {
    return execFileSync("lsof", ["-nP", "-a", "-i", "-p", String(pid)]).toString().trim();
  } catch {
    return "";
  }
};

const result = {};
await tsReq("configure", { preferences: { includeCompletionsWithInsertText: true }, hostInfo: "runyard-spike" });
// tsserver 用整份 updateOpen 打开（与 VS Code 的 TS 扩展一样，.vue 也交给 tsserver）
await tsReq("updateOpen", { openFiles: [{ file: useFile, fileContent: text, projectRootPath: projDir, scriptKindName: "TS" }] });
log("tsserver opened");

const init = await lsp("initialize", {
  processId: process.pid,
  rootUri: pathToFileURL(projDir).href,
  workspaceFolders: [{ uri: pathToFileURL(projDir).href, name: "proj" }],
  capabilities: {
    textDocument: {
      completion: { completionItem: { snippetSupport: true, labelDetailsSupport: true } },
      hover: { contentFormat: ["markdown", "plaintext"] },
      diagnostic: {},
    },
    workspace: { configuration: true, workspaceFolders: true },
  },
  initializationOptions: { typescript: { tsdk: tsLib } },
});
notify("initialized", {});
log("vls initialized", init.result.serverInfo);
notify("textDocument/didOpen", { textDocument: { uri: useUri, languageId: "vue", version, text } });

const labels = (r) => (r.result?.items ?? r.result ?? []).map((i) => i.label);

// 1. 属性名补全：<Child | />
let t = performance.now();
const pc = posOf("<Child  />", 7);
let r = await lsp("textDocument/completion", { textDocument: { uri: useUri }, position: pc });
result.firstPropCompletionMs = Math.round(performance.now() - t);
result.firstPropCompletionSinceStartMs = ms();
const propLabels = labels(r);
result.propCompletionHas = ["title", "count", "tone", ":title", "@select", "@close", "onSelect"].filter((x) => propLabels.includes(x) || propLabels.some((l) => l.replace(/^[:@]|^v-bind:|^v-on:/, "") === x.replace(/^[:@]/, "")));
result.propLabelsSample = propLabels.slice(0, 40);
t = performance.now();
r = await lsp("textDocument/completion", { textDocument: { uri: useUri }, position: pc });
result.secondPropCompletionMs = Math.round(performance.now() - t);

// 2. 事件补全：<Child @| />
await setText(text.replace(/<Child  \/>(?![\s\S]*<Child  \/>)/, "<Child @ />"));
t = performance.now();
r = await lsp("textDocument/completion", { textDocument: { uri: useUri }, position: posOf("<Child @ />", 8) });
result.eventCompletionMs = Math.round(performance.now() - t);
result.eventLabels = labels(r).slice(0, 30);

// 3. 组件名补全：<Chi|
await setText(text.replace("<Child @ />", "<Chi"));
t = performance.now();
r = await lsp("textDocument/completion", { textDocument: { uri: useUri }, position: posOf("<Chi", 4) });
result.tagCompletionMs = Math.round(performance.now() - t);
result.tagHasChild = labels(r).includes("Child");
await setText(readFileSync(useFile, "utf8"));

// 4. 脚本里来自 node_modules/vue 的类型（tsserver 直接答）
t = performance.now();
let q = await tsReq("quickinfo", { file: useFile, ...tsPos(posOf("const n = ref", 6, "first")) });
result.hoverRefMs = Math.round(performance.now() - t);
result.hoverRef = q.body?.displayString;
q = await tsReq("quickinfo", { file: useFile, ...tsPos(posOf("const doubled", 6, "first")) });
result.hoverComputed = q.body?.displayString;
// 模板里的属性悬停（tsserver 经插件映射）
q = await tsReq("quickinfo", { file: useFile, ...tsPos(posOf('title="a"', 1, "first")) });
result.hoverTemplateProp = q.body?.displayString;

// 5. 脚本成员补全 n.|
await setText(text.replace("n.value = id;", "n.value = id;\n  n."));
t = performance.now();
q = await tsReq("completionInfo", { file: useFile, ...tsPos(posOf("  n.", 4)) });
result.memberCompletionMs = Math.round(performance.now() - t);
result.memberHasValue = (q.body?.entries ?? []).some((e) => e.name === "value");
await setText(readFileSync(useFile, "utf8"));
// 从 "vue" 导入的补全（真实包的导出）
await setText(text.replace('import { computed, ref } from "vue";', 'import { computed, ref, wat } from "vue";'));
q = await tsReq("completionInfo", { file: useFile, ...tsPos(posOf("wat", 0, "first")) });
const vueExports = (q.body?.entries ?? []).map((e) => e.name);
result.vueImportHas = ["watch", "watchEffect", "defineComponent", "onMounted"].filter((x) => vueExports.includes(x));
await setText(readFileSync(useFile, "utf8"));

// 6. 跳转：模板里的 <Child 和 title 属性
q = await tsReq("definition", { file: useFile, ...tsPos(posOf("<Child title", 2, "first")) });
result.defTag = (q.body ?? []).map((d) => `${d.file.replace(projDir, "")}:${d.start.line}`);
q = await tsReq("definition", { file: useFile, ...tsPos(posOf('title="a"', 1, "first")) });
result.defProp = (q.body ?? []).map((d) => `${d.file.replace(projDir, "")}:${d.start.line}`);
q = await tsReq("definition", { file: useFile, ...tsPos(posOf("{{ missingVar", 3, "first")) });
// 7. 报错：tsserver 的语义诊断（含模板里的类型错误）+ Vue 服务器的诊断
t = performance.now();
q = await tsReq("semanticDiagnosticsSync", { file: useFile });
result.diagMs = Math.round(performance.now() - t);
result.tsDiagnostics = (q.body ?? []).map((d) => `${d.code}@${d.start.line}: ${d.text.slice(0, 70)}`);
r = await lsp("textDocument/diagnostic", { textDocument: { uri: useUri } });
result.vueDiagnostics = (r.result?.items ?? []).map((d) => `${d.code}@${d.range.start.line + 1}: ${String(d.message).slice(0, 60)}`);

// 8. 悬停：Vue 服务器（模板）
r = await lsp("textDocument/hover", { textDocument: { uri: useUri }, position: posOf("<Child title", 2, "first") });
result.vlsHoverTag = JSON.stringify(r.result?.contents ?? null).slice(0, 120);

if (process.env.OUTSIDE) {
  const of = process.env.OUTSIDE;
  const o = await tsReq("updateOpen", { openFiles: [{ file: of, projectRootPath: projDir }] });
  const oq = await tsReq("quickinfo", { file: of, line: 1, offset: 7 });
  result.outsideRead = oq.body?.displayString ?? `denied/empty: ${oq.message}`;
}
result.tsserverRelays = relayCount;
result.rssMB = { tsserver: Math.round(pidRss(tss.pid)), vueServer: Math.round(pidRss(vls.pid)) };
result.sockets = { tsserver: sockets(tss.pid), vueServer: sockets(vls.pid) };
result.totalMs = ms();
console.log(JSON.stringify(result, null, 2));

await lsp("shutdown", null);
notify("exit", null);
tss.kill();
setTimeout(() => process.exit(0), 300);
