import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { openMany } from "./support/file-tabs-fixture.ts";
import { launchRunyard } from "./support/launch.ts";

// 真实编辑器多文件标签；只比较标签条外观，预览和代码采用测试项目，不冒充设计稿示例内容。
const repo = resolve(import.meta.dirname, "..", "..", "..");
const output =
  process.env.RUNYARD_FILE_TABS_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-file-tabs-"));
mkdirSync(output, { recursive: true });
console.log(`文件标签取证目录：${output}`);
const realPaths = [join(homedir(), ".runyard"), join(homedir(), "Runyard")];
const times = () => realPaths.map((path) => (existsSync(path) ? statSync(path).mtimeMs : null));
const before = times();
const measurements: unknown[] = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const design = await browser.newPage();
try {
  for (const lang of ["zh-CN", "en"] as const) {
    for (const theme of ["light", "dark"] as const) {
      const instance = await launchRunyard({ lang, theme });
      try {
        await openMany(instance, false, lang);
        const tabs = instance.page.getByRole("tablist", {
          name: lang === "en" ? "File tabs" : "文件标签",
        });
        const board = `Web${theme === "light" ? "Light" : ""}${lang === "en" ? "En" : ""}`;
        for (const width of [1440, 1100]) {
          const name = `${lang}-${theme}-${width}`;
          const height = 900;
          await instance.app.evaluate(
            ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setContentSize(w, 900),
            width,
          );
          await instance.page.setViewportSize({ width, height });
          await expect.poll(() => instance.page.evaluate(() => innerWidth)).toBe(width);
          await instance.page.getByRole("treeitem", { name: "module-06.ts", exact: true }).click();
          await expect(tabs.getByRole("tab", { selected: true })).toHaveAttribute(
            "data-path",
            "module-06.ts",
          );
          await tabs.hover();
          await instance.page.mouse.move(1, 1);
          await instance.page.evaluate(() => document.fonts.ready);
          const metric = await tabs.evaluate((view) => {
            const v = view.getBoundingClientRect();
            const item = view.querySelector("[data-selected]")?.getBoundingClientRect();
            const close = view
              .querySelector("[data-selected] > button:last-child")
              ?.getBoundingClientRect();
            const bar = view.parentElement?.querySelector(
              ':scope > [data-orientation="horizontal"]',
            );
            return {
              viewport: view.clientWidth,
              scrollWidth: view.scrollWidth,
              scrollLeft: view.scrollLeft,
              itemVisible: !!item && item.left >= v.left - 1 && item.right <= v.right + 1,
              closeVisible: !!close && close.left >= v.left - 1 && close.right <= v.right + 1,
              scrollbar: bar ? getComputedStyle(bar).visibility : "missing",
            };
          });
          expect(metric.scrollWidth).toBeGreaterThan(metric.viewport);
          expect(metric.itemVisible).toBe(true);
          expect(metric.closeVisible).toBe(true);
          expect(metric.scrollbar).toBe("hidden");
          measurements.push({ name, ...metric });
          const actual = await instance.page.screenshot({
            path: join(output, `${name}-app.png`),
            scale: "css",
          });
          await tabs
            .locator("..")
            .screenshot({ path: join(output, `${name}-tabs.png`), scale: "css" });
          await design.setViewportSize({ width: 1440, height: 900 });
          await design.goto(
            pathToFileURL(join(repo, "tooling/design-render/build", `${board}.html`)).href,
          );
          await design.evaluate(() => document.fonts.ready);
          const expected = await design.screenshot({ path: join(output, `${name}-design.png`) });
          await design.setViewportSize({ width: width + 1440, height: 940 });
          await design.setContent(
            `<html><meta charset="utf-8"><style>body{margin:0;font:16px system-ui;background:#eee}.pair{display:flex}figure{margin:0}figcaption{height:40px;display:flex;align-items:center;padding-left:16px}img{display:block}</style><div class="pair"><figure><figcaption>${board} · 设计稿（1440）</figcaption><img src="data:image/png;base64,${expected.toString("base64")}"></figure><figure><figcaption>${name} · 真实多文件编辑器</figcaption><img src="data:image/png;base64,${actual.toString("base64")}"></figure></div></html>`,
          );
          await design.screenshot({ path: join(output, `${name}-comparison.png`) });
        }
      } finally {
        await instance.shutdown();
      }
    }
  }
} finally {
  await browser.close();
  const after = times();
  writeFileSync(
    join(output, "measurements.json"),
    JSON.stringify({ before, after, measurements }, null, 2),
  );
  expect(after).toEqual(before);
}
writeFileSync(
  join(output, "README.md"),
  "# 文件标签设计对照\n\n八组中英/浅深/1440与1100宽，实际打开13个文件标签，鼠标经过后滑块仍不可见，激活标签和关闭钮完整。设计稿只有少量文件，代码及预览内容与本次HTML测试项目不同；本次只核文件标签样式/尺寸，增加多标签是负责人批准的滚动场景。另附标签条裁图；其它区域滚动条保持默认。全部启动使用临时HOME/root，修改时间核对在measurements.json。\n",
);
console.log(`八组对照完成：${output}`);
