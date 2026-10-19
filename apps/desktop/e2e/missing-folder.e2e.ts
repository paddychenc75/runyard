import { renameSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./support/fixtures.ts";

async function closeEmptyPicker(page: import("@playwright/test").Page) {
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
}

test("[DESKTOP-LIBRARY-VIEW-49] 打开前发现新近移走的目录，定位说明并可重新定位", async ({
  launch,
}) => {
  const instance = await launch({ lang: "en", theme: "light" });
  await closeEmptyPicker(instance.page);
  await instance.cli("new", "html", "missing-demo");
  const row = instance.page.locator("[data-row-id]");
  await expect(row).toHaveCount(1);
  const id = await row.getAttribute("data-row-id");
  expect(id).not.toBeNull();
  const moved = join(instance.home, "moved-demo");
  renameSync(join(instance.library, "missing-demo"), moved);
  await instance.call("tab.open", id);
  await expect(row).toContainText("Folder not found");
  await expect(row.getByRole("button", { name: "Open", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Locate…", exact: true })).toBeFocused();
  const state = await instance.call<{ tabs: unknown[]; activeTab: string }>("library.get");
  expect(state.tabs).toEqual([]);
  expect(state.activeTab).toBe("library");
  await instance.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, moved);
  await row.getByRole("button", { name: "Locate…", exact: true }).click();
  await expect(row).not.toContainText("Folder not found");
  await expect(row.getByRole("button", { name: "Open", exact: true })).toBeVisible();
});

test("[DESKTOP-LIBRARY-VIEW-49] 窗口focus检查已知目录，移走与放回都无需重启", async ({
  launch,
}) => {
  const instance = await launch({ lang: "en", theme: "light" });
  await closeEmptyPicker(instance.page);
  await instance.cli("new", "html", "focus-demo");
  const row = instance.page.locator("[data-row-id]");
  await expect(row).toHaveCount(1);
  const original = join(instance.library, "focus-demo");
  const moved = join(instance.home, "moved-focus");
  renameSync(original, moved);
  await instance.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.emit("focus");
  });
  await expect(row).toContainText("Folder not found");
  renameSync(moved, original);
  await instance.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.emit("focus");
  });
  await expect(row).not.toContainText("Folder not found");
});

test("[DESKTOP-LIBRARY-VIEW-49] [DESKTOP-WORKSPACE-11] 打开的未运行项目目录移走，文件变化更新说明且禁用运行", async ({
  launch,
}) => {
  const instance = await launch({ lang: "en", theme: "light" });
  await closeEmptyPicker(instance.page);
  await instance.cli("new", "html", "watch-demo");
  const row = instance.page.locator("[data-row-id]");
  await expect(row).toHaveCount(1);
  const id = await row.getAttribute("data-row-id");
  await instance.call("tab.openWithoutRun", id);
  await expect(instance.page.locator("[data-preview-stopped]")).toContainText("has not run yet");
  await expect(instance.page.getByRole("tab", { name: "index.html", exact: true })).toBeVisible();
  renameSync(join(instance.library, "watch-demo"), join(instance.home, "moved-watch"));
  await expect(instance.page.locator("[data-missing-note]")).toBeVisible();
  await expect(instance.page.locator("[data-preview-stopped]")).toHaveCount(0);
  await expect(
    instance.page.locator("[data-run-bar]").getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
});
