import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "./support/fixtures.ts";
import { openSettingsWindow } from "./support/settings-window.ts";

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
  const page = await openSettingsWindow(instance);
  await page
    .locator("[data-settings-header]")
    .getByRole("button", { name: "命令行与智能体", exact: true })
    .click();
  await page.getByRole("button", { name: "查看说明", exact: true }).click();
  const opened = () =>
    instance.app.evaluate(
      () => (globalThis as unknown as { skillGuideOpened: string[] }).skillGuideOpened,
    );
  await expect.poll(opened).toHaveLength(1);
  await instance.call("settings.set", { language: "en" });
  await page.getByRole("button", { name: "View guide", exact: true }).click();
  await expect.poll(opened).toHaveLength(2);
  const files = await opened();
  expect(files.map((file) => basename(file))).toEqual(["SKILL.zh-CN.md", "SKILL.md"]);
  expect(readFileSync(files[0] ?? "", "utf8")).toContain("这是给人看的中文对照");
  expect(readFileSync(files[1] ?? "", "utf8")).toContain("## Workflow");
  expect(await instance.call("agents.openGuide", "../../private.md")).toEqual({ ok: false });
  expect(await opened()).toHaveLength(2);
  for (const home of [instance.home, instance.root])
    for (const target of [".claude", ".agents"])
      expect(existsSync(join(home, target, "skills", "runyard", "SKILL.md"))).toBe(false);
});
