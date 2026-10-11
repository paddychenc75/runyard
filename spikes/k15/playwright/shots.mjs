// macos-26 上：中文是不是苹方？同一页面两次截图是否逐像素一致（同一进程两次、两个进程、同一环境下浅色与深色）？
// 字体判定用 Chromium 的 CSS.getPlatformFontsForNode（实际渲染用的字体），不靠猜。
// 用法：node shots.mjs <输出目录> <标签>
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = resolve(process.argv[2] ?? "out");
const label = process.argv[3] ?? "local";
mkdirSync(out, { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const url = pathToFileURL(resolve("page.html")).href;

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8" }).trim(); } catch (e) { return `(失败: ${e.message.split("\n")[0]})`; } };
const env = {
  label, platform: process.platform, arch: process.arch,
  os: process.platform === "darwin" ? sh("sw_vers", []) : process.platform,
  imageVersion: process.env.ImageVersion ?? null, imageOS: process.env.ImageOS ?? null,
  node: process.version,
};
if (process.platform === "darwin") {
  env.pingfangFiles = sh("sh", ["-c", "ls /System/Library/AssetsV2 2>/dev/null | head -0; system_profiler SPFontsDataType 2>/dev/null | grep -c 'PingFang SC'"]);
}

const browser = await chromium.launch();
env.chromium = browser.version();
const results = { env, runs: {} };

async function fonts(page, cdp, id) {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `#${id}` });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  return fonts.map((f) => `${f.familyName}${f.isCustomFont ? "(custom)" : ""}×${f.glyphCount}`);
}

for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 560, height: 360 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const fontMap = {};
  for (const id of ["zh-system", "en-system", "zh-sans", "zh-ping", "zh-yahei", "zh-w300", "zh-w600", "mono"]) fontMap[id] = await fonts(page, cdp, id);
  const a = await page.screenshot();
  const b = await page.screenshot(); // 同一进程、同一页面、紧接着第二次
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  const c = await page.screenshot(); // 重新加载后
  const page2 = await ctx.newPage(); await page2.goto(url); await page2.evaluate(() => document.fonts.ready);
  const d = await page2.screenshot(); // 同一浏览器进程里的另一个页面
  writeFileSync(join(out, `${label}-${scheme}.png`), a);
  results.runs[scheme] = { fontMap, sha256: { first: sha(a), second: sha(b), afterReload: sha(c), otherPage: sha(d) }, bytes: a.length, sameInProcess: sha(a) === sha(b) && sha(a) === sha(c) && sha(a) === sha(d) };
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, `${label}.json`), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
