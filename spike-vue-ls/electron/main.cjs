const { app, utilityProcess } = require("electron");
const { join } = require("node:path");
const { readFileSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");
const [serverDir, projDir] = [process.env.SPIKE_SERVER, process.env.SPIKE_PROJ];
const tsLib = join(serverDir, "node_modules/typescript/lib");
const shim = join(__dirname, "ipc-shim.cjs");
const perm = ["--permission", `--allow-fs-read=${serverDir}`, `--allow-fs-read=${projDir}`, `--allow-fs-read=${__dirname}`];
const out = {};
app.whenReady().then(async () => {
  const T0 = performance.now();
  const tss = utilityProcess.fork(shim, [join(tsLib, "tsserver.js"), "--useNodeIpc", "--globalPlugins", "@vue/typescript-plugin", "--pluginProbeLocations", serverDir, "--disableAutomaticTypingAcquisition", "--suppressDiagnosticEvents"], { execArgv: perm, stdio: "pipe", serviceName: "vue-tsserver", cwd: projDir });
  const vls = utilityProcess.fork(shim, [join(serverDir, "node_modules/@vue/language-server/index.js"), "--node-ipc", `--tsdk=${tsLib}`], { execArgv: perm, stdio: "pipe", serviceName: "vue-language-server", cwd: projDir });
  for (const [n, p] of [["tss", tss], ["vls", vls]]) { p.stderr.on("data", (d) => console.error(`[${n} err]`, String(d).slice(0, 300))); p.on("exit", (c) => console.error(`[${n} exit]`, c)); }
  let seq = 0; const wait = new Map();
  tss.on("message", (m) => { if (m.type === "response" && wait.has(m.request_seq)) { wait.get(m.request_seq)(m); wait.delete(m.request_seq); } });
  const ts = (command, args) => { const s = ++seq; tss.postMessage({ seq: s, type: "request", command, arguments: args }); return new Promise((r) => wait.set(s, r)); };
  let id = 0; const lw = new Map();
  vls.on("message", (m) => {
    if (m.id !== undefined && m.method) vls.postMessage({ jsonrpc: "2.0", id: m.id, result: m.method === "workspace/configuration" ? m.params.items.map(() => null) : null });
    else if (m.id !== undefined && lw.has(m.id)) { lw.get(m.id)(m); lw.delete(m.id); }
    else if (m.method === "tsserver/request") { const [rid, c, a] = m.params[0]; ts(c, a).then((res) => vls.postMessage({ jsonrpc: "2.0", method: "tsserver/response", params: [[rid, res.body]] })); }
  });
  const lsp = (method, params) => { const i = ++id; vls.postMessage({ jsonrpc: "2.0", id: i, method, params }); return new Promise((r) => lw.set(i, r)); };
  const file = join(projDir, "src/Use.vue"); const uri = pathToFileURL(file).href; const text = readFileSync(file, "utf8");
  const pos = (needle, extra) => { const b = text.slice(0, text.lastIndexOf(needle) + extra).split("\n"); return { line: b.length - 1, character: b.at(-1).length }; };
  await ts("updateOpen", { openFiles: [{ file, fileContent: text, projectRootPath: projDir, scriptKindName: "TS" }] });
  await lsp("initialize", { processId: null, rootUri: pathToFileURL(projDir).href, workspaceFolders: [{ uri: pathToFileURL(projDir).href, name: "p" }], capabilities: {}, initializationOptions: { typescript: { tsdk: tsLib } } });
  vls.postMessage({ jsonrpc: "2.0", method: "initialized", params: {} });
  vls.postMessage({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri, languageId: "vue", version: 1, text } } });
  const r = await lsp("textDocument/completion", { textDocument: { uri }, position: pos("<Child  />", 7) });
  out.firstPropCompletionSinceForkMs = Math.round(performance.now() - T0);
  const labels = (r.result?.items ?? r.result ?? []).map((i) => i.label);
  out.props = [":title", ":count", ":tone", "@select", "@close"].filter((x) => labels.includes(x));
  const q = await ts("quickinfo", { file, line: 5, offset: 7 });
  out.hover = q.body?.displayString;
  const d = await ts("semanticDiagnosticsSync", { file });
  out.diags = (d.body ?? []).map((x) => x.code);
  const rss = (pid) => Math.round(Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString()) / 1024);
  out.rssMB = { tsserver: rss(tss.pid), vls: rss(vls.pid) };
  // 权限模型是否生效：让 tsserver 读项目外的文件
  const outside = await ts("updateOpen", { openFiles: [{ file: join(process.env.HOME, "outside.ts"), projectRootPath: process.env.HOME }] });
  out.outsideOpen = outside.success;
  const qo = await ts("quickinfo", { file: join(process.env.HOME, "outside.ts"), line: 1, offset: 7 });
  out.outsideQuickinfo = qo.body?.displayString ?? qo.message;
  out.sockets = (() => { try { return execFileSync("lsof", ["-nP", "-a", "-i", "-p", `${tss.pid},${vls.pid}`]).toString(); } catch { return ""; } })();
  console.log("RESULT", JSON.stringify(out));
  tss.kill(); vls.kill(); app.quit();
});
