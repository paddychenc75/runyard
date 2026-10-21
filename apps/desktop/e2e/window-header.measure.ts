import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { composeEvidence } from "./preview-image-comparison.ts";
import { launchRunyard, type RunyardApp } from "./support/launch.ts";
import { openLibraryPage } from "./support/library-sidebar.ts";
import { openSettingsPage } from "./support/settings-page.ts";

const out = process.env.RUNYARD_HEADER_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-header-"));
mkdirSync(out, { recursive: true });
console.log(out);
const repo = resolve(import.meta.dirname, "../../..");
const browser = await chromium.launch({
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
          await app.page
            .locator("tr[data-row-id]")
            .filter({ hasText: "header-review" })
            .getByText("header-review", { exact: true })
            .dblclick();
          await expect(app.page.getByRole("tab", { name: /^(Library|资源库)$/ })).toHaveCount(0);
          await expect(app.page.locator("[data-library-sidebar]")).toBeVisible();
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
          await hide.click();
          await expect(app.page.locator("[data-library-sidebar]")).toHaveCount(0);
          await capture(
            app.page,
            `${name}-project-hidden`,
            `Web${theme === "light" ? "Light" : ""}${lang === "en" ? "En" : ""}`,
            width,
            app,
          );
          await show.click();
          const settings = await openSettingsPage(app);
          await settings.setViewportSize({ width, height: 900 });
          const settingsWindow = await app.app.browserWindow(settings);
          expect(await settingsWindow.evaluate((win) => win.getWindowButtonPosition())).toEqual(
            native,
          );
          await capture(settings, `${name}-settings`, `Settings${suffix}`, width);
          await openLibraryPage(app.page);
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

writeFileSync(
  join(out, "README.md"),
  "# 常驻全局侧栏画面对照\n\n1440/1100 × 中文/英文 × 浅色/深色；每组包含资源库展开/收起、项目展开/收起、主窗口设置。左侧是只读原设计，右侧为真实 Electron；原生预览截图按其真实坐标合成，原始图一并保留。\n\n与设计稿的有意差异：负责人 2026-10-21 批准取消顶部资源库标签、全局侧栏在项目中常驻且可收起；工作区相应让位。设置为此前批准的主窗口页面，因此不再是设计稿的独立窗口。文件树独立开合与窄窗原生预览让位由 persistent-sidebar.e2e.ts 另行回归。\n",
);
