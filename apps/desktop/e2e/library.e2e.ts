import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./support/fixtures.ts";

test("资源库：搜索与筛选、重命名、改备注、移到废纸篓", async ({ launch }) => {
  const runyard = await launch();
  const { page } = runyard;
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("new", "python", "beta");
  await runyard.cli("run", "alpha");
  await page.keyboard.press("Escape");
  const rows = page.getByRole("table", { name: "Playgrounds" }).getByRole("row");
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(1);

  // 搜索：按名称，清空后恢复
  const search = page.getByRole("textbox", { name: "Search playgrounds" });
  await search.fill("bet");
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(1);
  await expect(page.getByText("1 result")).toBeVisible();
  await search.fill("");
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(1);

  // 状态筛选：只看运行中的，再换回全部
  await page.getByRole("button", { name: /^Status/ }).click();
  await page.getByRole("menuitemradio", { name: "Running" }).click();
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(1);
  await page.getByRole("button", { name: /^Status/ }).click();
  await page.getByRole("menuitemradio", { name: "All" }).click();
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(1);

  // 重命名：行内编辑，文件夹跟着改名
  await page.getByRole("button", { name: "More actions for alpha" }).click();
  await page.getByRole("menuitem", { name: /^Rename/ }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("alpha-renamed");
  await page.keyboard.press("Enter");
  await expect(rows.filter({ hasText: "alpha-renamed" })).toHaveCount(1);
  expect(existsSync(join(runyard.library, "alpha-renamed"))).toBe(true);
  expect(existsSync(join(runyard.library, "alpha"))).toBe(false);

  // 改备注，并且能按备注搜到
  await page.getByRole("button", { name: "More actions for alpha-renamed" }).click();
  await page.getByRole("menuitem", { name: /^Edit note/ }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("remember-this-note");
  await page.keyboard.press("Enter");
  await expect(rows.filter({ hasText: "remember-this-note" })).toHaveCount(1);
  await search.fill("remember-this");
  await expect(rows.filter({ hasText: "alpha-renamed" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(0);
  await search.fill("");

  // 移到废纸篓：先确认；平台的废纸篓在临时主目录里，文件夹从资源库消失、出现在废纸篓
  await page.getByRole("button", { name: "More actions for alpha-renamed" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await page
    .getByRole("alertdialog", { name: /Move alpha-renamed to the Trash/ })
    .getByRole("button", { name: "Move to Trash" })
    .click();
  await expect(rows.filter({ hasText: "alpha-renamed" })).toHaveCount(0);
  expect(existsSync(join(runyard.library, "alpha-renamed"))).toBe(false);
  const trash = join(runyard.root, ".Trash");
  expect(readdirSync(trash).some((name) => name.startsWith("alpha-renamed"))).toBe(true);
});
