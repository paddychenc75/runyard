import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";

const out = process.env.RUNYARD_STATUS_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-status-"));
mkdirSync(out, { recursive: true });
const repo = resolve(import.meta.dirname, "../../..");
const chrome = await chromium.launch({
  executablePath:
    process.env.RUNYARD_REVIEW_CHROME ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const metrics: unknown[] = [];
try {
  for (const theme of ["light", "dark"] as const)
    for (const lang of ["zh-CN", "en"] as const) {
      const instance = await launchRunyard({ theme, lang });
      try {
        const page = instance.page;
        await expect(page.getByRole("combobox")).toBeFocused();
        await page.keyboard.press("Escape");
        await instance.cli("new", "html", "react-counter");
        await expect(page.locator("[data-row-id]")).toHaveCount(1);
        const state = await instance.call<{
          playgrounds: { id: string; [key: string]: unknown }[];
          tabs: Record<string, unknown>[];
          [key: string]: unknown;
        }>("library.get");
        const base = state.playgrounds[0];
        if (!base) throw new Error("missing project fixture");
        await instance.call("tab.openWithoutRun", base.id);
        const opened = await instance.call<typeof state>("library.get");
        const tab = opened.tabs[0];
        if (!tab) throw new Error("missing tab fixture");
        await instance.app.evaluate(({ ipcMain }, fixed) => {
          const handlers = (
            ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
          )._invokeHandlers;
          const original = handlers.get("desktop:call");
          if (!original) throw new Error("missing IPC handler");
          ipcMain.removeHandler("desktop:call");
          ipcMain.handle("desktop:call", (event, method, ...args) =>
            method === "library.get" ? fixed : original(event, method, ...args),
          );
        }, state);
        for (const width of [1440, 1100]) {
          await page.setViewportSize({ width, height: 900 });
          for (const screen of ["Main", "Crashed", "StartFailed", "ScriptFailed"]) {
            const failed = screen === "StartFailed" || screen === "ScriptFailed";
            const current = {
              ...tab,
              state: failed ? "failed" : "crashed",
              status: "crashed",
              active: false,
              port: null,
              previewUrl: null,
              exitCode: 1,
              lastFrame: null,
              kind: screen === "ScriptFailed" ? "oneshot" : "server",
              failure: failed
                ? {
                    code: screen === "StartFailed" ? "SETUP_FAILED" : "RUN_FAILED",
                    params: { name: "react-counter" },
                  }
                : null,
            };
            const fixture = {
              ...state,
              libraryRoot: "~/Runyard",
              tabs: [current],
              activeTab: screen === "Main" ? "library" : base.id,
              playgrounds: [{ ...base, state: "crashed", active: false }],
            };
            await instance.app.evaluate(({ BrowserWindow }, fixed) => {
              const main = BrowserWindow.getAllWindows()[0];
              main?.webContents.send("desktop:event", "library.changed", fixed);
              main?.focus();
            }, fixture);
            if (screen === "Main") {
              await expect(page.getByRole("navigation")).toBeVisible();
              await expect(page.getByRole("navigation")).toHaveAttribute("data-active", "true");
              const selected = page.getByRole("navigation").locator('button[aria-current="page"]');
              await expect(selected).toHaveCSS(
                "background-color",
                theme === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.1)",
              );
              await expect(selected).toHaveCSS(
                "color",
                theme === "light" ? "rgb(29, 29, 31)" : "rgb(245, 245, 247)",
              );
            } else
              await expect(page.locator('[data-size="hero"][data-status="crashed"]')).toBeVisible();
            const sizes = await page.locator('[data-status="crashed"]').evaluateAll((nodes) =>
              nodes.flatMap((node) => {
                const mark = node.querySelector('[aria-hidden="true"], [role="img"]');
                if (!mark) return [];
                const r = mark.getBoundingClientRect();
                const style = getComputedStyle(mark);
                return [
                  {
                    size: node.getAttribute("data-size"),
                    width: r.width,
                    height: r.height,
                    radius: style.borderRadius,
                    cross: getComputedStyle(mark, "::before").content,
                  },
                ];
              }),
            );
            for (const mark of sizes)
              if (mark.width > 0)
                expect(mark.width).toBe(mark.size === "hero" ? 44 : mark.size === "step" ? 18 : 12);
            metrics.push({ theme, lang, width, screen, sizes });
            const board = `${screen}${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
            const name = `${width}-${theme}-${lang}-${screen}`;
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
              `<style>body{margin:0;background:#ddd}main{display:flex;gap:16px}img{width:${width}px}</style><p>#466 ${name}：左设计，右打包应用固定状态。仅核对侧栏选中与出错符号，品牌/表格/脚本布局由其他已批准任务承接。</p><main><img src="data:image/png;base64,${design.toString("base64")}"><img src="data:image/png;base64,${actual.toString("base64")}"></main>`,
            );
            await comparison.screenshot({
              path: join(out, `${name}-comparison.png`),
              fullPage: true,
            });
            await comparison.close();
            if (screen === "Main") {
              await page.evaluate(() => window.dispatchEvent(new Event("blur")));
              await expect(page.getByRole("navigation")).toHaveAttribute("data-active", "false");
              await expect(
                page
                  .getByRole("navigation")
                  .locator('button[aria-current="page"] > [aria-hidden="true"]'),
              ).toHaveCSS(
                "background-color",
                theme === "light" ? "rgb(110, 110, 115)" : "rgb(161, 161, 166)",
              );

              await page.screenshot({
                path: join(out, `${name}-inactive.png`),
                animations: "disabled",
              });
            }
          }
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
