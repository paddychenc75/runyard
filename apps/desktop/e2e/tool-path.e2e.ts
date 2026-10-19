import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { closePicker, expect, pressMenuShortcut, test } from "./support/fixtures.ts";
import { openSettingsPage } from "./support/settings-page.ts";

// 真正的工具校验只执行临时 HOME 中的固定脚本，不改用户工具或真实设置。
test("[DESKTOP-SETTINGS-41] [DESKTOP-SETTINGS-42] [DESKTOP-SETTINGS-43] 输入路径校验保存、错误保留、重新读取与撤销", async ({
  launch,
}) => {
  const runyard = await launch({ lang: "en", theme: "light" });
  const mainPage = runyard.page;
  const dir = join(runyard.home, "Tool Paths");
  mkdirSync(dir);
  const executable = join(dir, "node");
  const invalid = join(dir, "not-node");
  for (const [file, output] of [
    [executable, "v24.21.0"],
    [invalid, "not a runtime"],
  ] as const) {
    writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' '${output}'\n`);
    chmodSync(file, 0o755);
  }
  await closePicker(mainPage);
  const page = await openSettingsPage(runyard);
  await page
    .locator("[data-settings-header]")
    .getByRole("button", { name: "Runtime", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Node executable path" });
  await expect(input).toBeVisible();
  await input.fill(executable);
  await input.press("Enter");
  await expect
    .poll(() => runyard.call("settings.get"))
    .toMatchObject({ toolPaths: { node: executable } });
  await expect(page.getByRole("table", { name: "Runtime" })).toContainText("24.21.0");
  // #491：设置已落盘不等于校验回包结束，下一次提交必须等输入恢复可保存。
  await expect(input).toHaveAttribute("aria-busy", "false");
  await input.fill(invalid);
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("previous path is unchanged");
  expect(await runyard.call("settings.get")).toMatchObject({ toolPaths: { node: executable } });
  await expect(input).toHaveValue(invalid);
  await input.press("Escape");
  await expect(input).toHaveValue(executable);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await input.fill("/uncommitted/node");
  await input.press("Escape");
  await input.press("Tab");
  await expect(page.getByRole("button", { name: "Choose Node executable" })).toBeFocused();
  // 页面重新装载会重建所有草稿和检测视图，验证已保存路径从后台读回。
  await page.reload();
  await closePicker(page);
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+,");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page
    .locator("[data-settings-header]")
    .getByRole("button", { name: "Runtime", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Node executable path" })).toHaveValue(executable);
});
