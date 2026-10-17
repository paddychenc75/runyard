// usage: node drive.mjs <Runyard.app> <outfile.json> <variant...>
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [app, outFile, ...variants] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const home = mkdtempSync(join(process.env.K8_TMP ?? tmpdir(), "k8home-"));
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
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");
await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push({d:e.violatedDirective,u:e.blockedURI.slice(0,90)}));` });
const results = {};
for (const v of variants) {
  events.length = 0;
  await send("Page.navigate", { url: `app://runyard/${v === "index" ? "" : v.includes(".") ? v : v + ".html"}` });
  const t0 = Date.now(); let r;
  for (;;) {
    await sleep(500);
    const e = await send("Runtime.evaluate", { expression: "JSON.stringify({k:window.__k8||null,csp:window.__csp||[]})", returnByValue: true });
    r = e.result?.result?.value ? JSON.parse(e.result.result.value) : null;
    if (r?.k?.done || Date.now() - t0 > 420000) break;
  }
  const urls = new Set(); const consoleMsgs = [];
  for (const ev of events) {
    if (ev.method === "Network.requestWillBeSent") urls.add(ev.params.request.url.replace(/(app:\/\/runyard\/[^?#]*).*/, "$1"));
    if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") consoleMsgs.push(ev.params.entry.text.slice(0, 160));
    if (ev.method === "Runtime.exceptionThrown") consoleMsgs.push("EXC " + (ev.params.exceptionDetails.exception?.description ?? ev.params.exceptionDetails.text).slice(0, 200));
  }
  const nonApp = [...urls].filter((u) => !u.startsWith("app://runyard/"));
  const cspSummary = {}; for (const c of r?.csp ?? []) { const k = `${c.d} <- ${c.u.startsWith("data:") ? "data:" : c.u.split("/").slice(0,4).join("/")}`; cspSummary[k] = (cspSummary[k] ?? 0) + 1; }
  results[v] = { elapsedMs: Date.now() - t0, k8: r?.k, cspViolations: cspSummary, requestUrls: [...urls].filter((u) => !/workers\/|\.ttf$/.test(u)), nonAppRequests: nonApp, workerRequests: [...urls].filter((u) => /workers\//.test(u)), fontRequests: [...urls].filter((u) => /\.ttf$/.test(u)), errors: [...new Set(consoleMsgs)].slice(0, 12) };
  console.error(v, "done", !!r?.k?.done, "csp", Object.keys(cspSummary).length, "errors", consoleMsgs.length);
}
writeFileSync(outFile, JSON.stringify(results, null, 1));
// stop only the process we started: verify pid and start time
const nowStart = execFileSync("ps", ["-o", "lstart=", "-p", String(child.pid)]).toString().trim();
if (nowStart === startTime) { child.kill("SIGTERM"); await sleep(1500); }
console.error("stderr:", stderr.join("").slice(0, 300));
process.exit(0);
