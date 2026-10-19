import { closePicker, expect, pressMenuShortcut, test } from "./support/fixtures.ts";
import { showLibrarySidebar } from "./support/library-sidebar.ts";
import { openSettingsPage } from "./support/settings-page.ts";

test("[DESKTOP-SETTINGS-47] 窄窗口覆盖侧栏展开时菜单打开设置会收回导航", async ({ launch }) => {
  const runyard = await launch();
  const page = runyard.page;
  await closePicker(page);
  const main = await runyard.app.browserWindow(page);
  await main.evaluate((window) => window.setContentSize(720, 760));
  await showLibrarySidebar(page);
  await expect(page.getByRole("navigation")).toBeVisible();
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+,");
  const title = page.getByRole("heading", { level: 1, name: "Settings" });
  await expect(title).toBeFocused();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(await title.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");
  await page.getByRole("tab", { name: /Library/ }).click();
  await expect(title).toHaveCount(0);
});

test("[DESKTOP-SETTINGS-01] [DESKTOP-SETTINGS-37] 三入口复用主窗口设置页面且不重建草稿", async ({
  launch,
}) => {
  const runyard = await launch();
  const page = runyard.page;
  await closePicker(page);
  await showLibrarySidebar(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Library/ })).toBeVisible();
  await page
    .locator("[data-settings-header]")
    .getByRole("button", { name: "Runtime", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Node executable path", exact: true });
  await input.fill("/not-saved/node");
  const top = await page.locator("#settings-viewport").evaluate((node) => node.scrollTop);
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+,");
  await expect(input).toHaveValue("/not-saved/node");
  await expect(input).toBeFocused();
  expect(await page.locator("#settings-viewport").evaluate((node) => node.scrollTop)).toBe(top);
  expect(
    await runyard.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1);
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+W");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toHaveCount(0);
  expect(page.isClosed()).toBe(false);
});

test("[DESKTOP-SETTINGS-48] 隐藏主窗口时菜单打开设置先显示原窗口", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  const main = await runyard.app.browserWindow(runyard.page);
  await main.evaluate((window) => window.hide());
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+,");
  await expect
    .poll(() => main.evaluate((window) => window.isVisible() && window.isFocused()))
    .toBe(true);
  await expect(runyard.page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  expect(
    await runyard.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(1);
});

test("[DESKTOP-SETTINGS-03] [DESKTOP-SETTINGS-04] 返回后重开同步语言主题并保留窗口尺寸", async ({
  launch,
}) => {
  const runyard = await launch({ theme: "system" });
  await closePicker(runyard.page);
  const page = await openSettingsPage(runyard);
  const main = await runyard.app.browserWindow(page);
  const bounds = await main.evaluate((window) => window.getBounds());
  await runyard.call("settings.set", { language: "zh-CN", theme: "dark" });
  await expect(page.getByRole("heading", { name: "设置", level: 1 })).toBeVisible();
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+W");
  await openSettingsPage(runyard);
  expect(await main.evaluate((window) => window.getBounds())).toEqual(bounds);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "跟随系统", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  expect(await runyard.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe("system");
});

test("[DESKTOP-SETTINGS-18] 路径选择框继续由主窗口承接", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  await openSettingsPage(runyard);
  await runyard.app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async (window) => {
      (globalThis as { pickerOwner?: number }).pickerOwner = (window as { id: number }).id;
      return { canceled: true, filePaths: [] };
    };
  });
  await runyard.call("toolchain.pickPath", "node");
  const main = await runyard.app.browserWindow(runyard.page);
  expect(
    await runyard.app.evaluate(() => (globalThis as { pickerOwner?: number }).pickerOwner),
  ).toBe(await main.evaluate((window) => window.id));
});
