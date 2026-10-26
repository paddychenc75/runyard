import type { LibraryState } from "../src/shared/library-state.ts";
import { closePicker, expect, pressMenuShortcut, test } from "./support/fixtures.ts";
import type { RunyardApp } from "./support/launch.ts";
import { openLibraryPage } from "./support/library-sidebar.ts";

async function prepareProjects(instance: RunyardApp) {
  await closePicker(instance.page);
  const window = await instance.app.browserWindow(instance.page);
  await window.evaluate((win) => win.setContentSize(1440, 900));
  for (const name of ["sidebar-alpha", "sidebar-beta"]) {
    await instance.cli("new", "html", name);
    const row = instance.page.locator("tr[data-row-id]").filter({ hasText: name });
    await row.getByRole("button", { name: "Open", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await instance.call<LibraryState>("library.get")).tabs.find((tab) => tab.name === name)
            ?.state,
      )
      .toBe("ready");
    await openLibraryPage(instance.page);
  }
}

async function visiblePreviews(instance: RunyardApp) {
  const window = await instance.app.browserWindow(instance.page);
  return window.evaluate(
    (win) =>
      win.contentView.children.filter((view: { getVisible(): boolean }) => view.getVisible())
        .length,
  );
}

test("[DESKTOP-LIBRARY-VIEW-63][DESKTOP-LIBRARY-VIEW-64][DESKTOP-WORKSPACE-03][DESKTOP-WORKSPACE-62] 项目共享全局侧栏偏好且文件树独立，资源库保留键盘项目入口", async ({
  launch,
}) => {
  const instance = await launch();
  const { page, app } = instance;
  await prepareProjects(instance);
  const nav = page.getByRole("navigation", { name: "Library navigation" });
  const alpha = page
    .getByRole("tablist", { name: "Tabs", exact: true })
    .getByRole("tab", { name: /sidebar-alpha$/ });
  const beta = page
    .getByRole("tablist", { name: "Tabs", exact: true })
    .getByRole("tab", { name: /sidebar-beta$/ });
  await expect(page.getByRole("tab", { name: "Library", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { selected: true })).toHaveCount(0);
  const entry = page.getByRole("tablist").locator('[role="tab"][tabindex="0"]');
  await expect(entry).toHaveCount(1);
  await nav.getByRole("button", { name: "Settings", exact: true }).focus();
  for (
    let step = 0;
    step < 20 && !(await entry.evaluate((node) => node === document.activeElement));
    step++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(entry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-glass-material="filetree"]')).toBeVisible();
  await alpha.click();
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
  const runs = (await instance.call<LibraryState>("library.get")).runs;
  await pressMenuShortcut(app, "Ctrl+Cmd+S");
  await expect(nav).toHaveCount(0);
  await expect(page.locator('[data-glass-material="filetree"]')).toBeVisible();
  await beta.click();
  await expect(nav).toHaveCount(0);
  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  await expect(nav).toBeVisible();
  const tree = page.locator('[data-glass-material="filetree"]');
  await tree.getByRole("button", { name: "Hide file tree", exact: true }).click();
  await expect(tree).toHaveCount(0);
  await expect(nav).toBeVisible();
  await openLibraryPage(page);
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(2);
  await pressMenuShortcut(app, "CmdOrCtrl+W");
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(2);
  expect((await instance.call<LibraryState>("library.get")).runs).toEqual(runs);
  await beta.click();
  await expect(nav).toBeVisible();
  await expect(tree).toHaveCount(0);
});

test("[DESKTOP-WORKSPACE-61][DESKTOP-WORKSPACE-79] 720 宽项目侧栏占位展开时预览收起，收回恢复且不改手动偏好", async ({
  launch,
}) => {
  const instance = await launch();
  const { page, app } = instance;
  await prepareProjects(instance);
  await page
    .getByRole("tablist", { name: "Tabs", exact: true })
    .getByRole("tab", { name: /sidebar-alpha$/ })
    .click();
  const saved = () => page.evaluate(() => localStorage.getItem("runyard.layout.v1"));
  const before = await saved();
  const window = await app.browserWindow(page);
  await window.evaluate((win) => win.setContentSize(720, 800));
  const nav = page.getByRole("navigation", { name: "Library navigation" });
  await expect(nav).toHaveCount(0);
  await expect.poll(() => visiblePreviews(instance)).toBe(1);
  await pressMenuShortcut(app, "Ctrl+Cmd+S");
  await expect(nav.getByRole("button").first()).toBeFocused();
  await expect(page.locator("[data-sidebar-overlay]")).toHaveCount(0);
  await expect(page.locator("[data-preview-slot]")).toHaveCount(0);
  await expect.poll(() => visiblePreviews(instance)).toBe(0);
  await pressMenuShortcut(app, "Ctrl+Cmd+S");
  await expect(nav).toHaveCount(0);
  await expect(page.locator("[data-preview-slot]")).toHaveCount(1);
  await expect.poll(() => visiblePreviews(instance)).toBe(1);
  expect(await saved()).toBe(before);
  await window.evaluate((win) => win.setContentSize(1440, 900));
  await expect(nav).toBeVisible();
  expect(await saved()).toBe(before);
});
