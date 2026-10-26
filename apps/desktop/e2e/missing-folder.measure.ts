import { mkdirSync, mkdtempSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";

const out =
  process.env.RUNYARD_MISSING_FOLDER_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-folder-missing-"));
mkdirSync(out, { recursive: true });
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
        const page = instance.page;
        await expect(page.getByRole("combobox")).toBeFocused();
        await page.keyboard.press("Escape");
        await instance.cli("new", "vue3", "vue-drag-list");
        await instance.cli("new", "html", "working-demo");
        const row = page.locator("tr[data-row-id]").filter({ hasText: "vue-drag-list" });
        await expect(row).toBeVisible();
        const id = await row.getAttribute("data-row-id");
        renameSync(join(instance.library, "vue-drag-list"), join(instance.home, "moved-demo"));
        await instance.call("tab.open", id);
        await expect(page.locator("[data-missing-note]")).toBeVisible();
        // 行内只剩“⋯”，“重新定位…”只在行下的说明里（走查 M1）
        const locate = page.locator("[data-missing-note]").getByRole("button", {
          name: lang === "en" ? "Locate…" : "重新定位…",
          exact: true,
        });
        await expect(locate).toBeFocused();
        for (const width of [1440, 1100]) {
          await page.setViewportSize({ width, height: 900 });
          await expect(locate).toBeVisible();
          const name = `${width}-${theme}-${lang}`;
          const actual = await page.screenshot({
            path: join(out, `${name}-actual.png`),
            scale: "css",
            animations: "disabled",
          });
          const board = `FolderMissing${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
          const designPage = await chrome.newPage({ viewport: { width, height: 900 } });
          await designPage.goto(
            pathToFileURL(join(repo, "tooling/design-render/build", `${board}.html`)).href,
          );
          const design = await designPage.screenshot({ path: join(out, `${name}-design.png`) });
          await designPage.close();
          const comparison = await chrome.newPage({
            viewport: { width: width * 2 + 32, height: 940 },
          });
          await comparison.setContent(
            `<style>body{margin:0;background:#ddd}main{display:flex;gap:16px}img{width:${width}px}</style><p>#428 ${name}：左为FolderMissing设计，右为测试项目真实移走后的打包应用。主操作改为重新定位，原路径与说明保留；表格结构由#457独立交付。</p><main><img src="data:image/png;base64,${design.toString("base64")}"><img src="data:image/png;base64,${actual.toString("base64")}"></main>`,
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
console.log(out);
