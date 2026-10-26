import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";
import { openSettingsPage } from "./support/settings-page.ts";

const out =
  process.env.RUNYARD_SKILL_GUIDE_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-skill-guide-"));
mkdirSync(out, { recursive: true });
const metrics: unknown[] = [];
const repo = resolve(import.meta.dirname, "../../..");
const chrome = await chromium.launch({
  executablePath:
    process.env.RUNYARD_REVIEW_CHROME ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  for (const theme of ["light", "dark"] as const)
    for (const lang of ["zh-CN", "en"] as const) {
      const instance = await launchRunyard({ theme, lang });
      try {
        await expect(instance.page.getByRole("combobox")).toBeFocused();
        await instance.page.keyboard.press("Escape");
        const page = await openSettingsPage(instance);
        const heading = lang === "en" ? "Command line and agents" : "命令行与智能体";
        for (const width of [1440, 1100]) {
          const settingsWidth = width;
          await instance.page.setViewportSize({ width, height: 900 });
          await page.setViewportSize({ width: settingsWidth, height: 900 });
          await page
            .locator("[data-settings-header]")
            .getByRole("button", { name: heading, exact: true })
            .click();
          await expect(
            page.getByRole("button", {
              name: lang === "en" ? "View guide" : "查看说明",
              exact: true,
            }),
          ).toBeVisible();
          const guide = page.getByRole("button", {
            name: lang === "en" ? "View guide" : "查看说明",
            exact: true,
          });
          await guide.focus();
          await page.keyboard.press("Tab");
          await page.keyboard.press("Shift+Tab");
          await expect(guide).toBeFocused();
          await expect
            .poll(() => guide.evaluate((node) => getComputedStyle(node).boxShadow))
            .not.toBe("none");
          const geometry = await guide.evaluate((node) => {
            const row = node.closest("[data-settings-row]") as HTMLElement;
            const box = node.getBoundingClientRect();
            const bounds = row.getBoundingClientRect();
            return {
              overflow: row.scrollWidth - row.clientWidth,
              left: box.left - bounds.left,
              right: bounds.right - box.right,
              focusRing: getComputedStyle(node).boxShadow,
            };
          });
          expect(geometry.overflow).toBe(0);
          expect(geometry.left).toBeGreaterThanOrEqual(4);
          expect(geometry.right).toBeGreaterThanOrEqual(4);
          expect(
            await page
              .locator("#settings-viewport")
              .evaluate((node) => node.scrollWidth - node.clientWidth),
          ).toBe(0);
          metrics.push({ theme, lang, width, settingsWidth, ...geometry });
          const name = `${width}-${theme}-${lang}`;
          const actual = await page.screenshot({
            path: join(out, `${name}-actual.png`),
            scale: "css",
            animations: "disabled",
          });
          const board = `Settings${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
          const designPage = await chrome.newPage({
            viewport: { width: settingsWidth, height: 900 },
          });
          await designPage.goto(
            pathToFileURL(join(repo, "tooling/design-render/build", `${board}.html`)).href,
          );
          const design = await designPage.screenshot({
            path: join(out, `${name}-design.png`),
            scale: "css",
          });
          await designPage.close();
          const comparison = await chrome.newPage({ viewport: { width: 1800, height: 940 } });
          await comparison.setContent(
            `<style>body{margin:0;background:#ddd}main{display:flex;gap:16px;align-items:flex-start}img{display:block}</style><p>#468 ${name}：左为现有 Settings 版式参考（设计稿没有命令行与智能体分区），右为打包应用的新入口。查看说明是已批准增量；主窗 ${width}，设置窗 ${settingsWidth}。</p><main><img src="data:image/png;base64,${design.toString("base64")}"><img src="data:image/png;base64,${actual.toString("base64")}"></main>`,
          );
          await comparison.screenshot({
            path: join(out, `${name}-comparison.png`),
            fullPage: true,
          });
          await comparison.close();
        }
      } finally {
        await instance.shutdown();
      }
    }
} finally {
  await chrome.close();
}
writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics, null, 2));
console.log(out);
