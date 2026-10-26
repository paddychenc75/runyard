import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";

const out =
  process.env.RUNYARD_TEMPLATE_CACHE_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-template-cache-"));
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
        const toolPath = join(instance.home, "go-verified");
        writeFileSync(toolPath, "#!/bin/sh\nprintf '%s\\n' 'go version go1.26.3 darwin/arm64'\n");
        chmodSync(toolPath, 0o755);
        await page
          .getByRole("navigation")
          .getByRole("button", { name: lang === "en" ? /^Templates/ : /^模板/ })
          .click();
        await page.getByRole("option", { name: /^Go/ }).click();
        expect(
          await instance.call("toolchain.setPath", { tool: "go", path: toolPath }),
        ).toMatchObject({ status: "set" });
        await expect(page.locator('tr[data-tool="go"]')).toContainText("1.26.3");
        for (const width of [1440, 1100]) {
          await page.setViewportSize({ width, height: 900 });
          const name = `${width}-${theme}-${lang}`;
          const actual = await page.screenshot({
            path: join(out, `${name}-actual.png`),
            scale: "css",
            animations: "disabled",
          });
          const board = `Templates${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
          const designPage = await chrome.newPage({ viewport: { width: 1440, height: 900 } });
          await designPage.goto(
            pathToFileURL(join(repo, "tooling/design-render/build", `${board}.html`)).href,
          );
          const design = await designPage.screenshot({ path: join(out, `${name}-design.png`) });
          await designPage.close();
          const comparison = await chrome.newPage({
            viewport: { width: 1440 + width + 32, height: 940 },
          });
          await comparison.setContent(
            `<style>body{margin:0;background:#ddd}main{display:flex;gap:16px}img{display:block}</style><p>#439 ${name}：左为完整Templates设计参考，右为当前选中Go且收到新工具缓存后的打包应用。保留正式规格的内置标记与命令模板写法，仅刷新已有检测结果。</p><main><img src="data:image/png;base64,${design.toString("base64")}"><img src="data:image/png;base64,${actual.toString("base64")}"></main>`,
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
