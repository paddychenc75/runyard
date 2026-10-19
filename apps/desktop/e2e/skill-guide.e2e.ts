import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./support/fixtures.ts";
import { openSettingsPage } from "./support/settings-page.ts";

test("[DESKTOP-SETTINGS-44] 未安装也能查看随包中英文说明，拒绝路径输入", async ({ launch }) => {
  const instance = await launch({ lang: "zh-CN", theme: "light" });
  await expect(instance.page.getByRole("combobox")).toBeFocused();
  await instance.page.keyboard.press("Escape");
  await expect(instance.page.getByRole("dialog")).toHaveCount(0);
  await instance.app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { skillGuideOpened: opened });
    shell.openPath = async (path) => {
      opened.push(path);
      return "";
    };
  });
  const page = await openSettingsPage(instance);
  await page
    .locator("[data-settings-header]")
    .getByRole("button", { name: "命令行与智能体", exact: true })
    .click();
  await page.getByRole("button", { name: "查看说明", exact: true }).click();
  const opened = () =>
    instance.app.evaluate(
      () => (globalThis as unknown as { skillGuideOpened: string[] }).skillGuideOpened,
    );
  const guide = page.getByRole("dialog");
  await expect(guide).toContainText("\u8fd9\u662f\u7ed9\u4eba\u770b\u7684\u4e2d\u6587\u5bf9\u7167");
  await page.keyboard.press("Escape");
  await instance.call("settings.set", { language: "en" });
  await page.getByRole("button", { name: "View guide", exact: true }).click();
  await expect(guide).toContainText("## Workflow");
  expect(await instance.call("agents.openGuide", "../../private.md")).toEqual({ ok: false });
  expect(await opened()).toHaveLength(0);
  for (const home of [instance.home, instance.root])
    for (const target of [".claude", ".agents"])
      expect(existsSync(join(home, target, "skills", "runyard", "SKILL.md"))).toBe(false);
});
