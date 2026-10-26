import { expect, test } from "./support/fixtures.ts";
import { openSettingsPage } from "./support/settings-page.ts";

test("[DESKTOP-SETTINGS-44] 说明在设置窗口内显示并可关闭", async ({ launch }, testInfo) => {
  const runyard = await launch({ lang: "zh-CN", theme: "dark" });
  await expect(runyard.page.getByRole("combobox")).toBeFocused();
  await runyard.page.keyboard.press("Escape");
  await expect(runyard.page.getByRole("dialog")).toHaveCount(0);
  const page = await openSettingsPage(runyard);
  await page.getByRole("button", { name: "查看说明" }).click();
  const dialog = page.getByRole("dialog", { name: "查看说明" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("工作流程");
  await page.screenshot({ path: testInfo.outputPath("skill-guide-dark.png") });
  await page.getByRole("button", { name: "关闭说明" }).click();
  await expect(dialog).not.toBeVisible();
  const path = page.getByRole("textbox", { name: "Node 可执行文件路径" });
  const original = await path.inputValue();
  await path.fill("/draft/node");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tool-path-save-dark.png") });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(path).toHaveValue(original);
});
