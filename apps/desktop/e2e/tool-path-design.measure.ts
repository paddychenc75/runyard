import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";
import { openSettingsPage } from "./support/settings-page.ts";

// 本脚本固定画面数据；真正执行文件、校验和持久化另由 tool-path.e2e.ts 验证。
const out =
  process.env.RUNYARD_TOOL_PATH_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-tool-path-"));
mkdirSync(out, { recursive: true });
const repo = resolve(import.meta.dirname, "../../..");
const tools = [
  {
    tool: "node",
    status: "found",
    version: "24.21.0",
    path: "/Users/demo/.nvm/versions/node/v24.21.0/bin/node",
    arch: "arm64",
  },
  {
    tool: "pnpm",
    status: "found",
    version: "11.28.0",
    path: "/Users/demo/Library/pnpm/pnpm",
    arch: "arm64",
  },
  {
    tool: "python",
    status: "too-old",
    version: "3.9.6",
    path: "/usr/bin/python3",
    arch: "universal",
    required: ">=3.10 <4",
  },
  {
    tool: "go",
    status: "missing",
    required: ">=1.26 <2",
    installCommand: "brew install go",
    installUrl: "https://go.dev/dl/",
  },
];
const measurements: unknown[] = [];
const chrome = await chromium.launch({
  executablePath:
    process.env.RUNYARD_REVIEW_CHROME ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  for (const theme of ["light", "dark"] as const)
    for (const lang of ["zh-CN", "en"] as const) {
      const runtimeName = lang === "en" ? "Runtime" : "运行环境";
      const board = `SettingsNarrow${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
      const designPage = await chrome.newPage({
        viewport: { width: 820, height: 1000 },
        deviceScaleFactor: 1,
      });
      await designPage.goto(
        pathToFileURL(join(repo, "tooling/design-render/build", `${board}.html`)).href,
      );
      const designSection = designPage
        .locator("section")
        .filter({ has: designPage.getByRole("heading", { name: runtimeName, exact: true }) });
      // 从完整设计中抽取对应分区；只移除外围裁切，保留分区内部设计尺寸和样式。
      await designSection.evaluate((section) => {
        let parent = section.parentElement;
        let background = "";
        while (parent && parent !== document.body) {
          const color = getComputedStyle(parent).backgroundColor;
          if (!background && color !== "rgba(0, 0, 0, 0)" && color !== "transparent")
            background = color;
          parent.style.overflow = "visible";
          parent = parent.parentElement;
        }
        if (background) (section as HTMLElement).style.backgroundColor = background;
      });
      const design = await designSection.screenshot({
        path: join(out, `${theme}-${lang}-design.png`),
        scale: "css",
      });
      await designPage.close();
      const instance = await launchRunyard({ theme, lang });
      try {
        const mainPage = instance.page;
        await expect(mainPage.getByRole("combobox")).toBeFocused();
        await mainPage.keyboard.press("Escape");
        await expect(mainPage.getByRole("dialog")).toHaveCount(0);
        await instance.app.evaluate(({ ipcMain }, fixture) => {
          const handlers = (
            ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
          )._invokeHandlers;
          const original = handlers.get("desktop:call");
          if (!original) throw new Error("desktop call handler missing");
          ipcMain.removeHandler("desktop:call");
          ipcMain.handle("desktop:call", (event, method, ...args) =>
            method === "toolchain.check" ? { tools: fixture } : original(event, method, ...args),
          );
        }, tools);
        const page = await openSettingsPage(instance);
        await page
          .locator("[data-settings-header]")
          .getByRole("button", { name: runtimeName, exact: true })
          .click();
        await expect(
          page.getByRole("textbox", {
            name: lang === "en" ? "Node executable path" : "Node 可执行文件路径",
          }),
        ).toHaveValue(tools[0]?.path ?? "");
        await page.getByRole("button", { name: "Go", exact: true }).click();
        for (const width of [1440, 1100]) {
          const settingsWidth = width;
          await mainPage.setViewportSize({ width, height: 900 });
          await instance.app.evaluate(
            ({ BrowserWindow }, w) =>
              BrowserWindow.getAllWindows()
                .find((window) => window.webContents.getURL().startsWith("app://runyard"))
                ?.setContentSize(w, 900),
            settingsWidth,
          );
          await page.setViewportSize({ width: settingsWidth, height: 900 });
          await page
            .locator("[data-settings-header]")
            .getByRole("button", { name: runtimeName, exact: true })
            .click();
          const runtime = page.locator('[data-settings-section="runtime"]');
          const metrics = await runtime.locator("tbody tr").evaluateAll((rows) =>
            rows
              .filter((row) => row.querySelector("[data-col=arch]"))
              .map((row) => {
                const arch = row.querySelector("[data-col=arch]") as HTMLElement;
                const status = row.querySelector("[data-col=status]") as HTMLElement;
                const input = row.querySelector("input") as HTMLInputElement;
                return {
                  arch: arch.textContent,
                  statusLeft: status.getBoundingClientRect().left,
                  gap: status.getBoundingClientRect().left - arch.getBoundingClientRect().right,
                  inputWidth: input.getBoundingClientRect().width,
                  rowWidth: row.getBoundingClientRect().width,
                  value: input.value,
                };
              }),
          );
          expect(new Set(metrics.map((item) => item.statusLeft)).size).toBe(1);
          for (const item of metrics) {
            expect(item.gap).toBeGreaterThanOrEqual(8);
            expect(item.inputWidth).toBeGreaterThan(400);
          }
          expect(
            await page
              .locator("#settings-viewport")
              .evaluate((node) => node.scrollWidth - node.clientWidth),
          ).toBe(0);
          const name = `${width}-${theme}-${lang}`;
          measurements.push({ name, settingsWidth, metrics });
          await page.screenshot({ path: join(out, `${name}-window.png`), scale: "css" });
          // 展开详情后分区高于滚动视口；另拍完整分区时增高自己的窗口，避免祖先裁切尾部说明。
          const regionHeight = Math.ceil((await runtime.boundingBox())?.height ?? 0);
          await instance.app.evaluate(
            ({ BrowserWindow }, size) =>
              BrowserWindow.getAllWindows()
                .find((window) => window.webContents.getURL().startsWith("app://runyard"))
                ?.setContentSize(size.width, size.height),
            { width: settingsWidth, height: regionHeight + 200 },
          );
          await page.setViewportSize({ width: settingsWidth, height: regionHeight + 200 });
          await page
            .locator("[data-settings-header]")
            .getByRole("button", { name: runtimeName, exact: true })
            .click();
          const actual = await runtime.screenshot({
            path: join(out, `${name}-runtime.png`),
            scale: "css",
          });
          const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px sans-serif;background:#ddd}main{display:flex;gap:16px;align-items:flex-start}figure{margin:0}img{display:block}</style><p>#484 ${name}：左为 ${board} 运行环境设计区域；右为真实组件固定状态。输入框、选择按钮与行内操作提示为已批准新增行为；主窗口设置页面为 ${settingsWidth} 宽，主窗口为 ${width} 宽。</p><main><figure><figcaption>现有设计</figcaption><img src="data:image/png;base64,${design.toString("base64")}"></figure><figure><figcaption>完整路径输入（增高窗口展示完整分区）</figcaption><img src="data:image/png;base64,${actual.toString("base64")}"></figure></main>`;
          writeFileSync(join(out, `${name}.html`), html);
          const comparison = await chrome.newPage({
            viewport: { width: 1520, height: 1000 },
            deviceScaleFactor: 1,
          });
          await comparison.setContent(html);
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
writeFileSync(join(out, "measurements.json"), JSON.stringify(measurements, null, 2));
writeFileSync(
  join(out, "README.md"),
  "#484：八组明暗中英×1440/1100设计对照，分别搭配820/760宽主窗口设置页。固定报告仅供视觉验证；输入保存和错误不覆盖由真实 Electron e2e 验证。架构含 universal，输入显示完整绝对路径。设计中的只读缩略路径改为可编辑输入，行高随输入和说明增加；沿用共享控件与设计变量。\n",
);
console.log(out);
