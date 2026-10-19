import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";
import { openSettingsPage } from "./support/settings-page.ts";

// 先用设计渲染器生成八张 Settings* 画板，再运行本脚本。每份应用只有临时 HOME/root。
const out =
  process.env.RUNYARD_SETTINGS_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-settings-"));
mkdirSync(out, { recursive: true });
const repo = resolve(import.meta.dirname, "../../..");
const measurements: unknown[] = [];
const chrome = await chromium.launch({
  executablePath:
    process.env.RUNYARD_REVIEW_CHROME ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  for (const width of [1440, 1100]) {
    for (const theme of ["light", "dark"] as const) {
      for (const lang of ["zh-CN", "en"] as const) {
        const instance = await launchRunyard({ theme, lang });
        const name = `${width}-${theme}-${lang}`;
        const board = `Settings${width === 1100 ? "Narrow" : ""}${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
        try {
          await expect(instance.page.getByRole("combobox")).toBeFocused();
          await instance.page.keyboard.press("Escape");
          await expect(instance.page.getByRole("dialog")).toHaveCount(0);
          const main = await instance.app.browserWindow(instance.page);
          await main.evaluate((window, width) => window.setContentSize(width, 900), width);
          const page = await openSettingsPage(instance);
          await expect(page.locator("[data-settings-row]").first()).toBeVisible();
          if (width === 1100) {
            await page
              .locator("[data-settings-header]")
              .getByRole("button", { name: lang === "en" ? "Editing and running" : "编辑与运行" })
              .click();
            await expect(page.locator("[data-settings-header]")).toHaveAttribute(
              "data-scrolled",
              "true",
            );
          }
          const measurement = await page.evaluate(() => {
            const header = document.querySelector("[data-settings-header]") as HTMLElement;
            const column = document.querySelector("[data-settings-column]") as HTMLElement;
            const viewport = document.getElementById("settings-viewport") as HTMLElement;
            const rect = column.getBoundingClientRect();
            const view = viewport.getBoundingClientRect();
            const rows = [...document.querySelectorAll("[data-settings-row]")].map((row) => {
              const text = row.firstElementChild as HTMLElement;
              const control = row.lastElementChild as HTMLElement;
              const hint = text.children[1] as HTMLElement | undefined;
              return {
                height: row.getBoundingClientRect().height,
                gap:
                  text === control
                    ? null
                    : control.getBoundingClientRect().left - text.getBoundingClientRect().right,
                hintLines: hint
                  ? hint.getBoundingClientRect().height /
                    Number.parseFloat(getComputedStyle(hint).lineHeight)
                  : 0,
              };
            });
            return {
              titleOutline: getComputedStyle(header.querySelector("h1") as HTMLElement)
                .outlineStyle,
              headerHeight: header.getBoundingClientRect().height,
              columnWidth: rect.width,
              centerOffset: rect.x + rect.width / 2 - view.x - view.width / 2,
              scrolled: header.dataset.scrolled,
              overflow: viewport.scrollWidth - viewport.clientWidth,
              rows,
            };
          });
          expect(measurement.headerHeight).toBe(88);
          expect(measurement.titleOutline).toBe("none");
          expect(measurement.columnWidth).toBe(720);
          expect(Math.abs(measurement.centerOffset)).toBeLessThanOrEqual(1);
          expect(measurement.overflow).toBe(0);
          for (const row of measurement.rows) {
            expect(row.height).toBeGreaterThanOrEqual(54);
            if (row.gap !== null) expect(row.gap).toBeGreaterThanOrEqual(24);
            expect(row.hintLines).toBeLessThanOrEqual(2);
          }
          measurements.push({ name, ...measurement });
          await page.screenshot({ path: join(out, `${name}-app.png`), scale: "css" });
          const actual = readFileSync(join(out, `${name}-app.png`)).toString("base64");
          const design = readFileSync(
            join(repo, "tooling/design-render/png", `${board}.png`),
          ).toString("base64");
          const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif;background:#ddd}header{padding:12px}main{display:flex;align-items:flex-start;gap:16px}figure{margin:0}figcaption{height:30px}img{display:block}</style><header>#523 ${name} — 左为原820宽独立设置参考，右为主窗口页面；保留顶部项目导航是本次批准的差异，移除重复52px窗口留白。按相同CSS逻辑像素展示。</header><main><figure><figcaption>${board} 设计</figcaption><img width="820" height="900" src="data:image/png;base64,${design}"></figure><figure><figcaption>实际主窗口 ${width}×900</figcaption><img src="data:image/png;base64,${actual}"></figure></main>`;
          writeFileSync(join(out, `${name}.html`), html);
          const comparison = await chrome.newPage({
            viewport: { width: 820 + width + 16, height: 990 },
            deviceScaleFactor: 1,
          });
          await comparison.setContent(html);
          await comparison.screenshot({
            path: join(out, `${name}-comparison.png`),
            fullPage: true,
          });
          await comparison.close();
        } finally {
          await instance.shutdown();
        }
      }
    }
  }
} finally {
  await chrome.close();
}
writeFileSync(join(out, "measurements.json"), JSON.stringify(measurements, null, 2));
console.log(out);
