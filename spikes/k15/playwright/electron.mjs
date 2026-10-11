// Playwright 1.63.0 对 Electron 44.4.5 和 WebContentsView 的支持：_electron.launch、找到视图里的页面、截图。
// 同时给出“在主进程里取预览内容”的退路（webContents.capturePage / executeJavaScript）是否可用。
import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "out");
const label = process.argv[3] ?? "local";
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const electronPath = require("electron"); // 返回 Electron 可执行文件路径
const result = { label, platform: process.platform, arch: process.arch, steps: {} };
const step = async (name, fn) => {
  const t0 = Date.now();
  try { result.steps[name] = { ok: true, value: await fn(), ms: Date.now() - t0 }; }
  catch (e) { result.steps[name] = { ok: false, error: String(e.message ?? e).split("\n")[0], ms: Date.now() - t0 }; }
};

const args = [resolve("app-main.cjs")];
if (process.platform === "linux") args.unshift("--no-sandbox"); // CI 的 Linux 上 chrome-sandbox 没有 setuid
let app;
await step("launch", async () => {
  app = await electron.launch({ executablePath: electronPath, args, timeout: 60000 });
  return "launched";
});
if (app) {
  await step("versions", () => app.evaluate(({ process }) => ({ electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node })));
  await step("waitReady", async () => { await app.waitForEvent("window", { timeout: 30000 }).catch(() => {}); await app.evaluate(async () => { while (!globalThis.__ready) await new Promise((r) => setTimeout(r, 100)); }); return "ready"; });
  let host;
  await step("firstWindow", async () => { host = await app.firstWindow(); return { title: await host.title(), url: host.url().slice(0, 40) }; });
  await step("windows()", async () => (await Promise.all(app.windows().map(async (p) => ({ title: await p.title(), url: p.url().slice(0, 40) })))));
  await step("context.pages()", async () => (await Promise.all(app.context().pages().map(async (p) => ({ title: await p.title(), url: p.url().slice(0, 40) })))));
  let view;
  await step("find view page by title 'preview'", async () => {
    for (let i = 0; i < 50 && !view; i++) {
      for (const p of app.context().pages()) if ((await p.title().catch(() => "")) === "preview") view = p;
      if (!view) await new Promise((r) => setTimeout(r, 100));
    }
    if (!view) throw new Error("context.pages() 里没有预览视图的页面");
    return "found";
  });
  if (view) {
    await step("view: read text via locator", async () => await view.locator("#v").textContent());
    await step("view: screenshot", async () => { const b = await view.screenshot(); writeFileSync(join(out, `${label}-view.png`), b); return { bytes: b.length }; });
    await step("view: evaluate in page", async () => await view.evaluate(() => ({ w: innerWidth, h: innerHeight })));
  }
  if (host) await step("host: screenshot", async () => { const b = await host.screenshot(); writeFileSync(join(out, `${label}-host.png`), b); return { bytes: b.length }; });
  // 退路：主进程里直接取预览内容
  await step("fallback: view.webContents.capturePage()", async () => {
    const b64 = await app.evaluate(async () => (await globalThis.__view.webContents.capturePage()).toPNG().toString("base64"));
    writeFileSync(join(out, `${label}-view-capture.png`), Buffer.from(b64, "base64")); return { bytes: Buffer.from(b64, "base64").length };
  });
  await step("fallback: view.webContents.executeJavaScript", async () => await app.evaluate(() => globalThis.__view.webContents.executeJavaScript("document.getElementById('v').textContent")));
  await step("close", async () => { await app.close(); return "closed"; });
}
writeFileSync(join(out, `${label}-electron.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
