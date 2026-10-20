import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { composeEvidence } from "./preview-image-comparison.ts";
import { previewText } from "./support/fixtures.ts";
import { launchRunyard, type RunyardApp } from "./support/launch.ts";

const out = process.env.RUNYARD_REQUEST_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-request-"));
mkdirSync(out, { recursive: true });
console.log(out);
const repo = resolve(import.meta.dirname, "../../..");
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
async function capture(page: Page, name: string, board: string, width: number, app?: RunyardApp) {
  await page.evaluate(() => document.fonts.ready);
  let actual = await page.screenshot({ path: join(out, `${name}-app.png`), scale: "css" });
  if (app) {
    const slot = await page.locator("[data-preview-slot]").boundingBox();
    if (!slot) throw new Error("preview slot missing");
    const png = await app.app.evaluate(async ({ webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((v) => v.getURL().startsWith("http://127.0.0.1:"));
      if (!view) throw new Error("preview missing");
      return (await view.capturePage()).toPNG().toString("base64");
    });
    const canvas = await browser.newPage();
    actual = await composeEvidence(canvas, width, 900, [
      { png: actual.toString("base64"), x: 0, y: 0, width, height: 900 },
      { png, ...slot },
    ]);
    await canvas.close();
    writeFileSync(join(out, `${name}-preview.png`), Buffer.from(png, "base64"));
    writeFileSync(join(out, `${name}-composited.png`), actual);
  }
  const design = readFileSync(join(repo, "tooling/design-render/png", `${board}.png`));
  const compare = await browser.newPage({ viewport: { width: 1440 + width + 16, height: 980 } });
  await compare.setContent(
    `<style>body{margin:0;background:#ddd;font:16px sans-serif}header{padding:12px}main{display:flex;gap:16px;align-items:start}img{display:block}</style><header>#436 ${name}：左为完整${board}设计参考，右为真实应用；历史响应提示和图标按钮是此次修复，设计参考没有停止后的专用响应画板。</header><main><img width="1440" src="data:image/png;base64,${design.toString("base64")}"><img width="${width}" src="data:image/png;base64,${actual.toString("base64")}"></main>`,
  );
  await compare.screenshot({ path: join(out, `${name}-comparison.png`), fullPage: true });
  await compare.close();
}
async function create(app: RunyardApp, template: string, name: string) {
  await app.cli("new", template, name);
  let id: string | undefined;
  await expect
    .poll(async () => {
      const state = await app.call<{ playgrounds: { id: string; name: string }[] }>("library.get");
      id = state.playgrounds.find((p) => p.name === name)?.id;
      return id;
    })
    .toBeTruthy();
  return id;
}
try {
  for (const theme of ["light", "dark"] as const)
    for (const lang of ["zh-CN", "en"] as const) {
      const app = await launchRunyard({ theme, lang });
      try {
        await expect(app.page.getByRole("combobox")).toBeFocused();
        await app.page.keyboard.press("Escape");
        const api = await create(app, "hono", "request-review");
        await app.call("tab.open", api);
        const panel = app.page.locator("[data-request-panel]");
        const send = panel.getByRole("button", {
          name: lang === "en" ? "Send" : "发送",
          exact: true,
        });
        for (const width of [1440, 1100]) {
          await app.app.evaluate(
            ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setContentSize(w, 900),
            width,
          );
          await app.page.setViewportSize({ width, height: 900 });
          if (width !== 1440) await app.call("run.start", api);
          await expect(send).toBeEnabled();
          await send.click();
          await expect(panel).toContainText("200 OK");
          const board = `Service${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
          await capture(app.page, `${width}-${theme}-${lang}-ready`, board, width);
          await app.call("run.stop", api);
          await expect(panel.locator('[data-stale="true"]')).toBeVisible();
          await expect(send).toBeDisabled();
          await capture(app.page, `${width}-${theme}-${lang}-stopped`, board, width);
        }
        const web = await create(app, "html", "preview-review");
        await app.call("tab.open", web);
        await expect(app.page.locator('[data-preview-pane][data-screen="page"]')).toBeVisible();
        await expect.poll(() => previewText(app.app)).toContain("Clicked 0 times");
        for (const width of [1440, 1100]) {
          await app.app.evaluate(
            ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setContentSize(w, 900),
            width,
          );
          await app.page.setViewportSize({ width, height: 900 });
          await capture(
            app.page,
            `${width}-${theme}-${lang}-web`,
            `Web${theme === "light" ? "Light" : ""}${lang === "en" ? "En" : ""}`,
            width,
            app,
          );
        }
      } finally {
        await app.shutdown();
      }
    }
} finally {
  await browser.close();
}
console.log(out);
