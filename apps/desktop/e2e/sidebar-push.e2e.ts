import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LibraryState } from "../src/shared/library-state.ts";
import { closePicker, expect, test } from "./support/fixtures.ts";
import type { RunyardApp } from "./support/launch.ts";
import { openLibraryPage } from "./support/library-sidebar.ts";

// 设了 RUNYARD_SHOTS_DIR 就顺带把各状态截图存进去（负责人走查用），不设就只做断言。
const shotsDir = process.env.RUNYARD_SHOTS_DIR;

async function shot(instance: RunyardApp, name: string) {
  if (shotsDir === undefined) return;
  mkdirSync(shotsDir, { recursive: true });
  const window = await instance.app.browserWindow(instance.page);
  const base64 = await window.evaluate(async (win) =>
    (await win.capturePage()).toPNG().toString("base64"),
  );
  writeFileSync(join(shotsDir, `${name}.png`), Buffer.from(base64, "base64"));
}

async function openProject(instance: RunyardApp, name: string) {
  const row = instance.page.locator("tr[data-row-id]").filter({ hasText: name });
  await row.getByRole("button", { name: "Open", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await instance.call<LibraryState>("library.get")).tabs.find((tab) => tab.name === name)
          ?.state,
    )
    .toBe("ready");
}

const widths = shotsDir === undefined ? [1000] : [1000, 1100, 1440];
const themes = shotsDir === undefined ? (["dark"] as const) : (["light", "dark"] as const);

for (const width of widths) {
  for (const theme of themes) {
    test(`[DESKTOP-WORKSPACE-72][DESKTOP-WORKSPACE-77][DESKTOP-WORKSPACE-78] 项目页侧栏展开占位置推开内容、不遮挡（${width} 宽 ${theme}）`, async ({
      launch,
    }) => {
      const instance = await launch({ theme });
      const { page } = instance;
      await closePicker(page);
      const window = await instance.app.browserWindow(page);
      await window.evaluate((win, w) => win.setContentSize(w, 800), width);
      for (const name of ["push-alpha", "push-beta"]) await instance.cli("new", "html", name);
      const nav = page.getByRole("navigation", { name: "Library navigation" });
      const tabs = page.getByRole("tablist", { name: "Tabs", exact: true });
      const narrow = width < 1280;

      // 资源库页：1100 宽侧栏常驻、1000 宽按资源库自己的规则收起
      if (width >= 1062) await expect(nav).toBeVisible();
      await shot(instance, `${width}-${theme}-1-library`);

      await openProject(instance, "push-alpha");
      await openLibraryPage(page);
      // 窄窗口先从资源库临时展开侧栏（1062 以下），再打开项目：侧栏随之收起
      if (width < 1062)
        await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
      await openProject(instance, "push-beta");
      await page.getByRole("tab", { name: /push-alpha$/ }).click();
      if (narrow) {
        // 窄窗口打开项目：侧栏收起
        await expect(nav).toHaveCount(0);
        await shot(instance, `${width}-${theme}-2-project-collapsed`);
        await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
      }
      await expect(nav).toBeVisible();
      await expect(page.locator("[data-sidebar-overlay]")).toHaveCount(0);
      // 鼠标点出来的侧栏，没有任何一项带键盘焦点环
      expect(
        await page.evaluate(() => document.querySelector("[data-library-sidebar] :focus-visible")),
      ).toBeNull();
      await shot(instance, `${width}-${theme}-3-project-sidebar-open`);

      // 内容整体在侧栏右边：顶部标签、文件树、编辑器、预览占位都不与侧栏相交
      const sidebarBox = await page.locator("[data-library-sidebar]").boundingBox();
      if (sidebarBox === null) throw new Error("侧栏没有盒子");
      const right = sidebarBox.x + sidebarBox.width;
      for (const locator of [
        tabs,
        page.locator('[data-glass-material="filetree"]'),
        page.locator("[data-preview-slot]"),
      ]) {
        // 文件树在放不下时自动收成窄条，此时没有这个面板
        if ((await locator.count()) === 0) continue;
        const box = await locator.boundingBox();
        if (box !== null) expect(box.x).toBeGreaterThanOrEqual(right);
      }
      const editor = await page.locator(".monaco-editor").first().boundingBox();
      // 编辑器卡片 420，Monaco 在卡片边线里面，量到的是 418
      expect(editor?.width ?? 0).toBeGreaterThanOrEqual(418);
      // 窗口里的内容不横向溢出
      const content = await page.locator("[data-preview-slot]").boundingBox();
      expect((content?.x ?? 0) + (content?.width ?? 0)).toBeLessThanOrEqual(width);

      // 从顶部标签切到另一个项目，侧栏保持
      await page.getByRole("tab", { name: /push-beta$/ }).click();
      await expect(nav).toBeVisible();
      await shot(instance, `${width}-${theme}-4-after-tab-switch`);
    });
  }
}
