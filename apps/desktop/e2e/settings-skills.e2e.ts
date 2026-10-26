import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./support/fixtures.ts";
import { openSettingsPage } from "./support/settings-page.ts";

// 智能体技能包一行的真实流程（规格 DESKTOP-SETTINGS-24、50 至 60）：安装、改文件模拟旧版、更新、移除、无写权限的失败。
// 应用带 --root 时它同时是技能包所在的主目录，都在临时目录里；不碰真实的 ~/.claude/skills 和 ~/.agents/skills。
test("[DESKTOP-SETTINGS-57] 安装、旧版提示、更新、移除、写入失败", async ({ launch }) => {
  const instance = await launch({ lang: "zh-CN", theme: "light" });
  // 启动和重新载入后都会弹“打开项目”选择框，先关掉，否则它的遮罩挡住后面的点击
  const dismissPicker = async () => {
    await expect(instance.page.getByRole("combobox")).toBeFocused();
    await instance.page.keyboard.press("Escape");
    await expect(instance.page.getByRole("dialog")).toHaveCount(0);
  };
  await dismissPicker();
  const skillFile = join(instance.root, ".claude", "skills", "runyard", "SKILL.md");
  const goToCli = async () => {
    const page = await openSettingsPage(instance);
    await page
      .locator("[data-settings-header]")
      .getByRole("button", { name: "命令行与智能体", exact: true })
      .click();
    return page;
  };
  let page = await goToCli();
  await expect(page.getByText("未安装", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "安装…" }).click();
  await page.getByRole("menuitem", { name: "Claude Code" }).click();
  await expect(page.getByText("已装到 Claude Code")).toBeVisible();
  expect(existsSync(skillFile)).toBe(true);

  // 改一下技能文件，模拟装的是旧版：重新打开设置后显示“有新版本”
  const original = readFileSync(skillFile, "utf8");
  writeFileSync(skillFile, `${original}\n用户改过的一行\n`);
  await page.reload();
  await dismissPicker();
  page = await goToCli();
  await expect(page.getByText("有新版本")).toBeVisible();
  await expect(page.getByText(/更新会覆盖你改过的技能文件/)).toBeVisible();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect(page.getByText("已装到 Claude Code")).toBeVisible();
  expect(readFileSync(skillFile, "utf8")).toBe(original);

  // 无写入权限：Codex 的上级目录只读
  const agentsRoot = join(instance.root, ".agents");
  mkdirSync(agentsRoot, { recursive: true });
  chmodSync(agentsRoot, 0o500);
  try {
    await page.getByRole("button", { name: "安装到 Codex" }).click();
    await expect(page.getByText("没能装到 Codex：~/.agents/skills 没有写入权限")).toBeVisible();
    await expect(page.getByText("安装失败")).toBeVisible();
  } finally {
    chmodSync(agentsRoot, 0o700);
  }
  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.getByText("Claude Code、Codex", { exact: true })).toBeVisible();

  // 移除 Claude Code：先确认，之后只剩 Codex
  await page.getByRole("button", { name: "智能体技能包的更多操作" }).click();
  await page.getByRole("menuitem", { name: "移除…" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "移除", exact: true }).click();
  await expect(page.getByText("已装到 Codex")).toBeVisible();
  expect(existsSync(skillFile)).toBe(false);
  expect(existsSync(join(instance.root, ".agents", "skills", "runyard", "SKILL.md"))).toBe(true);
});
