import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWithKeyboard, expect, test } from "./support/fixtures.ts";
import { openSettingsPage } from "./support/settings-page.ts";

test("[DESKTOP-EDITOR-28] 设置前台且主窗隐藏时退出：显示保存询问，取消保留修改，保存后退出", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page } = runyard;
  await runyard.call("settings.set", { autoSave: "off" });
  await createWithKeyboard(page);
  await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/:\d+/);
  await page.getByRole("treeitem", { name: "index.html" }).click();
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("<h1>UNSAVED-SETTINGS-QUIT</h1>");
  await expect(page.getByRole("tab", { name: "index.html (unsaved)" })).toBeVisible();
  const file = join(runyard.library, "html-1", "index.html");
  expect(readFileSync(file, "utf8")).not.toContain("UNSAVED-SETTINGS-QUIT");
  const main = await runyard.app.browserWindow(page);
  const settingsPage = await openSettingsPage(runyard);
  try {
    await main.evaluate((window) => window.hide());
    // 与⌘Q同一条原生退出路径；先请求，不等待进程退出，因为要回答保存询问。
    await runyard.app.evaluate(({ app }) => app.quit());
    const prompt = page.getByRole("alertdialog");
    await expect(prompt).toBeVisible();
    await expect
      .poll(() => main.evaluate((window) => window.isVisible() && window.isFocused()))
      .toBe(true);
    await prompt.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(prompt).toHaveCount(0);
    expect(page.isClosed()).toBe(false);
    expect(settingsPage.isClosed()).toBe(false);
    expect(readFileSync(file, "utf8")).not.toContain("UNSAVED-SETTINGS-QUIT");
    await page.getByRole("tab", { name: /html-1/ }).click();
    await expect(page.getByRole("tab", { name: "index.html (unsaved)" })).toBeVisible();
    await runyard.app.evaluate(({ app }) => app.quit());
    await expect(prompt).toBeVisible();
    const closed = page.waitForEvent("close");
    await prompt.getByRole("button", { name: "Save", exact: true }).click();
    await closed;
    expect(readFileSync(file, "utf8")).toContain("UNSAVED-SETTINGS-QUIT");
  } finally {
    // 红例也要正常收尾：仅对本测试资源库里的询问选择放弃，不能让清理被隐藏询问卡住。
    if (!page.isClosed()) {
      await main.evaluate((window) => {
        window.show();
        window.focus();
      });
      await runyard.app.evaluate(({ app }) => app.quit());
      const discard = page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Don't save", exact: true });
      await discard.click();
    }
  }
});
