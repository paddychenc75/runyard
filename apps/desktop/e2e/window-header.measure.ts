import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { composeEvidence } from "./preview-image-comparison.ts";
import { launchRunyard, type RunyardApp } from "./support/launch.ts";
import { openSettingsWindow } from "./support/settings-window.ts";

const out = process.env.RUNYARD_HEADER_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-header-"));
mkdirSync(out, { recursive: true });
console.log(out);
const repo = resolve(import.meta.dirname, "../../..");
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const metrics: unknown[] = [];
async function capture(page: Page, name: string, board: string, width: number, app?: RunyardApp) {
  await page.evaluate(() => document.fonts.ready);
  let actual = await page.screenshot({ path: join(out, `${name}-app.png`), scale: "css" });
  if (app) {
    const slot = await page.locator("[data-preview-slot]").boundingBox();
    if (!slot) throw new Error("preview slot missing");
    const png = await app.app.evaluate(async ({ webContents }) => {
      const preview = webContents
        .getAllWebContents()
        .find((item) => item.getURL().startsWith("http://127.0.0.1:"));
      if (!preview) throw new Error("preview missing");
      return (await preview.capturePage()).toPNG().toString("base64");
    });
    writeFileSync(join(out, `${name}-preview.png`), Buffer.from(png, "base64"));
    const canvas = await browser.newPage();
    actual = await composeEvidence(canvas, width, 900, [
      { png: actual.toString("base64"), x: 0, y: 0, width, height: 900 },
      { png, ...slot },
    ]);
    await canvas.close();
    writeFileSync(join(out, `${name}-app-composited.png`), actual);
  }
  const design = readFileSync(join(repo, "tooling/design-render/png", `${board}.png`));
  const referenceWidth = board.startsWith("Settings") ? 820 : 1440;
  const compare = await browser.newPage({
    viewport: { width: referenceWidth + width + 16, height: 980 },
  });
  await compare.setContent(
    `<style>body{margin:0;background:#ddd;font:16px sans-serif}header{padding:12px}main{display:flex;gap:16px;align-items:start}img{display:block}</style><header>#446 ${name}：左为${board}完整设计参考，右为真实窗口；原生红绿灯位置由窗口API核对。</header><main><img width="${referenceWidth}" src="data:image/png;base64,${design.toString("base64")}"><img width="${width}" src="data:image/png;base64,${actual.toString("base64")}"></main>`,
  );
  await compare.screenshot({ path: join(out, `${name}-comparison.png`), fullPage: true });
  await compare.close();
}
try {
  for (const theme of ["light", "dark"] as const)
    for (const lang of ["zh-CN", "en"] as const) {
      const app = await launchRunyard({ theme, lang });
      try {
        await expect(app.page.getByRole("combobox")).toBeFocused();
        await app.page.keyboard.press("Escape");
        await app.cli("new", "html", "header-review");
        let id: string | undefined;
        await expect
          .poll(async () => {
            const state = await app.call<{ playgrounds: { id: string; name: string }[] }>(
              "library.get",
            );
            id = state.playgrounds.find((p) => p.name === "header-review")?.id;
            return id;
          })
          .toBeTruthy();
        const suffix = `${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
        for (const width of [1440, 1100]) {
          await app.app.evaluate(
            ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setContentSize(w, 900),
            width,
          );
          await app.page.setViewportSize({ width, height: 900 });
          const name = `${width}-${theme}-${lang}`;
          const native = await app.app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.getWindowButtonPosition(),
          );
          expect(native).toEqual({ x: 19, y: 19 });
          const hide = app.page.getByRole("button", {
            name: lang === "en" ? "Hide sidebar" : "收起侧栏",
            exact: true,
          });
          const shown = await hide.boundingBox();
          expect(shown).toMatchObject({ x: 90, y: 12, width: 28, height: 28 });
          expect((await app.page.getByRole("heading", { level: 1 }).boundingBox())?.y).toBe(70);
          await capture(app.page, `${name}-shown`, `Main${suffix}`, width);
          await hide.click();
          const show = app.page.getByRole("button", {
            name: lang === "en" ? "Show sidebar" : "显示侧栏",
            exact: true,
          });
          const hidden = await show.boundingBox();
          expect(hidden).toEqual(shown);
          expect((await app.page.getByRole("tablist").boundingBox())?.x).toBe(134);
          await capture(app.page, `${name}-hidden`, `MainSidebarHidden${suffix}`, width);
          await show.click();
          expect(await hide.boundingBox()).toEqual(shown);
          await app.call("tab.open", id);
          await expect(app.page.locator("[data-preview-slot]")).toBeVisible();
          await expect
            .poll(
              async () =>
                (
                  await app.call<{ tabs: { id: string; state: string }[] }>("library.get")
                ).tabs.find((tab) => tab.id === id)?.state,
            )
            .toBe("ready");
          const tree = app.page.locator('[data-glass-material="filetree"]');
          expect((await tree.boundingBox())?.y).toBe(52);
          expect(await tree.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("9px");
          await capture(
            app.page,
            `${name}-project`,
            `Web${theme === "light" ? "Light" : ""}${lang === "en" ? "En" : ""}`,
            width,
            app,
          );
          const settings = await openSettingsWindow(app);
          await settings.setViewportSize({ width: 820, height: 900 });
          const settingsWindow = await app.app.browserWindow(settings);
          expect(await settingsWindow.evaluate((win) => win.getWindowButtonPosition())).toEqual(
            native,
          );
          await capture(settings, `${name}-settings`, `Settings${suffix}`, 820);
          await settingsWindow.evaluate((win) => win.close());
          await app.page
            .getByRole("tab", { name: lang === "en" ? "Library" : "资源库", exact: true })
            .click();
          metrics.push({ name, native, shown, hidden });
        }
      } finally {
        await app.shutdown();
      }
    }
} finally {
  await browser.close();
}
writeFileSync(join(out, "measurements.json"), JSON.stringify(metrics, null, 2));
console.log(out);
