import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";

// 固定数据用于对照侧栏、筛选、空状态和自动清理文案；行为由编号单元测试覆盖。
const out =
  process.env.RUNYARD_SIDEBAR_FILTERS_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-sidebar-"));
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
        await instance.cli("new", "html", "pricing-demo");
        await expect(page.locator("[data-row-id]")).toHaveCount(1);
        const state = await instance.call<{
          playgrounds: { id: string; [key: string]: unknown }[];
          [key: string]: unknown;
        }>("library.get");
        const base = state.playgrounds[0];
        if (!base) throw new Error("missing visual fixture");
        const now = Date.now();
        const fixture = {
          ...state,
          libraryRoot: "~/Runyard",
          playgrounds: [
            { ...base, name: "pricing-demo", state: "ready", active: true, port: 7100 },
            {
              ...base,
              id: "clean",
              name: "layout-test",
              autoClean: { enabled: true, days: 30 },
              lastUsedAt: now - 18 * 86400000,
            },
            {
              ...base,
              id: "due",
              name: "node-ts-1",
              autoClean: { enabled: true, days: 7 },
              lastUsedAt: now - 6.5 * 86400000,
            },
          ],
        };
        await instance.app.evaluate(({ ipcMain, BrowserWindow }, fixed) => {
          const handlers = (
            ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
          )._invokeHandlers;
          const original = handlers.get("desktop:call");
          if (!original) throw new Error("missing IPC handler");
          ipcMain.removeHandler("desktop:call");
          ipcMain.handle("desktop:call", (event, method, ...args) =>
            method === "library.get" ? fixed : original(event, method, ...args),
          );
          BrowserWindow.getAllWindows()[0]?.webContents.send(
            "desktop:event",
            "library.changed",
            fixed,
          );
        }, fixture);
        await expect(page.locator('[data-row-id="clean"]')).toBeVisible();
        for (const width of [1440, 1100]) {
          await page.setViewportSize({ width, height: 900 });
          const zh = lang === "zh-CN";
          // 编辑器面包屑也是 navigation，必须按名字取资源库导航，否则严格模式报错
          const nav = page.getByRole("navigation", {
            name: zh ? "资源库导航" : "Library navigation",
          });
          const states = [
            { board: "Main", label: zh ? "全部" : "All" },
            { board: "LibraryRunning", label: zh ? "运行中" : "Running" },
            { board: "LibraryAutoClean", label: zh ? "自动清理" : "Auto-clean" },
            { board: "LibraryAgentEmpty", label: zh ? "智能体创建" : "Created by agents" },
            { board: "RowMenu", label: zh ? "全部" : "All" },
            { board: "AutoCleanDialog", label: zh ? "全部" : "All" },
            { board: "CleanReminder", label: zh ? "全部" : "All" },
          ];
          for (const screen of states.filter(
            (screen) =>
              !process.env.RUNYARD_SIDEBAR_BOARD ||
              screen.board === process.env.RUNYARD_SIDEBAR_BOARD,
          )) {
            await instance.app.evaluate(
              ({ BrowserWindow }, fixed) => {
                BrowserWindow.getAllWindows()[0]?.webContents.send(
                  "desktop:event",
                  "library.changed",
                  fixed,
                );
              },
              {
                ...fixture,
                cleanReminder:
                  screen.board === "CleanReminder"
                    ? [{ id: "due", name: "node-ts-1", idleDays: 6 }]
                    : [],
              },
            );

            await nav
              .getByRole("button", { name: new RegExp(`^${screen.label}\\s*\\d+$`) })
              .click();
            if (screen.board === "RowMenu" || screen.board === "AutoCleanDialog") {
              await page
                .locator(`[data-row-id="${base.id}"]`)
                .getByRole("button", { name: zh ? /的更多操作/ : /More actions for/ })
                .click();
              if (screen.board === "AutoCleanDialog")
                await page
                  .getByRole("menuitem", { name: zh ? /自动清理…/ : /Auto-clean…/ })
                  .click();
            }
            const board = `${screen.board}${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
            const name = `${width}-${theme}-${lang}-${screen.board}`;
            const actual = await page.screenshot({
              path: join(out, `${name}-actual.png`),
              scale: "css",
              animations: "disabled",
            });
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
              `<style>body{margin:0;background:#ddd}main{display:flex;gap:16px}img{width:${width}px}</style><p>${name}：左设计，右应用。品牌已按 #481 更新；表格结构由 #457 独立交付。</p><main><img src="data:image/png;base64,${design.toString("base64")}"><img src="data:image/png;base64,${actual.toString("base64")}"></main>`,
            );
            await comparison.screenshot({
              path: join(out, `${name}-comparison.png`),
              fullPage: true,
            });
            await comparison.close();
            if (screen.board === "AutoCleanDialog")
              await page.getByRole("button", { name: zh ? "取消" : "Cancel", exact: true }).click();
            if (screen.board === "RowMenu") await page.keyboard.press("Escape");
          }
        }
      } finally {
        await instance.shutdown();
      }
    }
} finally {
  await chrome.close();
}
writeFileSync(
  join(out, "README.md"),
  "#448 侧栏方案 A 与自动清理文案：浅深×中英×1440/1100。左设计右真实应用固定数据；项目名与数量为验证数据。品牌保留已批准 A；表格结构按 #457 独立交付，不在此变更。\n",
);
console.log(out);
