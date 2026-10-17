// usage: node drive-vue.mjs <Runyard.app> <outfile.json> [pageUrl]
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
const [app, outFile, pageUrl = "app://runyard/index.html"] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const home = mkdtempSync(join(process.env.SPIKE_TMP, "vhome-"));
mkdirSync(join(home, "root"));
const child = spawn(join(app, "Contents/MacOS/Runyard"), [`--remote-debugging-port=${port}`, "--root", join(home, "root")], { env: { ...process.env, HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
const stderr = []; child.stderr.on("data", (d) => stderr.push(String(d))); child.stdout.on("data", () => {});
const startTime = execFileSync("ps", ["-o", "lstart=", "-p", String(child.pid)]).toString().trim();
console.error(`app pid ${child.pid} started ${startTime} home ${home} port ${port}`);
async function targets() { try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { return []; } }
let page; for (let i = 0; i < 100 && !page; i++) { page = (await targets()).find((t) => t.type === "page" && t.url.startsWith("app://")); if (!page) await sleep(200); }
if (!page) throw new Error("no page " + stderr.join(""));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); };
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
function rss() { const out = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss=,command="]).toString().split("\n"); const rows = out.map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], kb: +m[3], cmd: m[4] })); const mine = rows.filter((r) => r.pid === child.pid || r.ppid === child.pid); return mine.map((r) => ({ pid: r.pid, mb: Math.round(r.kb / 1024), type: (r.cmd.match(/--type=(\w+)/) ?? [, "browser"])[1] + ((r.cmd.match(/--utility-sub-type=([\w.]+)/) ?? [])[1] ? ":" + r.cmd.match(/--utility-sub-type=([\w.]+)/)[1] : "") })); }
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");
await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push({d:e.violatedDirective,u:e.blockedURI.slice(0,90)}));` });
await sleep(1500);
const baseline = rss();
events.length = 0;
await send("Page.navigate", { url: pageUrl });
const t0 = Date.now(); let r;
for (;;) {
  await sleep(500);
  const e = await send("Runtime.evaluate", { expression: "JSON.stringify({k:window.__vue||null,csp:window.__csp||[]})", returnByValue: true });
  r = e.result?.result?.value ? JSON.parse(e.result.result.value) : null;
  if (r?.k?.done || Date.now() - t0 > 45000) break;
}
await sleep(1500);
const after = rss();
for (const e of events.filter((e) => e.method === 'Target.attachedToTarget' && e.params.targetInfo.type === 'worker')) await send('Runtime.enable', {}, e.params.sessionId);
const workers = events.filter((e) => e.method === "Target.attachedToTarget" && e.params.targetInfo.type === "worker").map((e) => ({ sid: e.params.sessionId, url: e.params.targetInfo.url.replace(/.*\//, "") }));
const heaps = {}; 
for (const w of workers) { const h = await send("Runtime.getHeapUsage", {}, w.sid); heaps[w.url] = h.result ? { usedMB: Math.round(h.result.usedSize / 1e5) / 10, totalMB: Math.round(h.result.totalSize / 1e5) / 10 } : h; }
const ph = await send("Runtime.getHeapUsage");
const urls = new Set(); const consoleMsgs = [];
for (const ev of events) {
  if (ev.method === "Network.requestWillBeSent") urls.add(ev.params.request.url.replace(/(app:\/\/runyard\/[^?#]*).*/, "$1"));
  if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") consoleMsgs.push(ev.params.entry.text.slice(0, 200));
  if (ev.method === "Runtime.exceptionThrown") consoleMsgs.push("EXC " + (ev.params.exceptionDetails.exception?.description ?? ev.params.exceptionDetails.text).slice(0, 300) + " @" + ev.params.exceptionDetails.url + ":" + ev.params.exceptionDetails.lineNumber + ":" + ev.params.exceptionDetails.columnNumber);
}
const cspSummary = {}; for (const c of r?.csp ?? []) { const k = `${c.d} <- ${c.u.startsWith("data:") ? "data:" : c.u.split("/").slice(0, 4).join("/")}`; cspSummary[k] = (cspSummary[k] ?? 0) + 1; }
const res = { elapsedMs: Date.now() - t0, vue: r?.k, cspViolations: cspSummary, nonAppRequests: [...urls].filter((u) => !u.startsWith("app://runyard/") && !u.startsWith("data:")), requests: [...urls].filter((u) => !u.startsWith("data:")).slice(0, 12), baselineProcs: baseline, afterProcs: after, workerHeaps: heaps, pageHeap: ph.result, errors: [...new Set(consoleMsgs)].slice(0, 12) };
writeFileSync(outFile, JSON.stringify(res, null, 1));

const wl = events.filter((e) => e.sessionId && (e.method === "Runtime.consoleAPICalled" || e.method === "Runtime.exceptionThrown")).map((e) => e.method + " " + JSON.stringify(e.params).slice(0, 400));
res.workerLogs = wl.slice(0, 15); writeFileSync(outFile, JSON.stringify(res, null, 1));
const nowStart = execFileSync("ps", ["-o", "lstart=", "-p", String(child.pid)]).toString().trim();
if (nowStart === startTime) { child.kill("SIGTERM"); await sleep(1500); }
console.error("done; stderr:", stderr.join("").slice(0, 200));
process.exit(0);
