import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Locator } from "@playwright/test";
import { closePicker, expect, test } from "./support/fixtures.ts";

test("资源库：搜索与筛选、重命名、改备注、移到废纸篓", async ({ launch }) => {
  const runyard = await launch();
  const { page } = runyard;
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("new", "python", "beta");
  await runyard.cli("run", "alpha");
  await closePicker(page);
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

test("资源库表格：窗口放得下和放不下时，表头与每一行逐列的 x 位置和宽度一致（#348）", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page, app } = runyard;
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("new", "python", "beta");
  await closePicker(page);
  const table = page.getByRole("table", { name: "Playgrounds" });
  await expect(table.getByRole("row").filter({ hasText: "alpha" })).toHaveCount(1);

  for (const width of [1600, 1200, 900]) {
    await app.evaluate(
      ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 800),
      width,
    );
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(width);
    const boxes = async (cells: Locator): Promise<{ left: number; width: number }[]> => {
      const out: { left: number; width: number }[] = [];
      for (const cell of await cells.all()) {
        const box = await cell.boundingBox();
        out.push({ left: Math.round(box?.x ?? -1), width: Math.round(box?.width ?? -1) });
      }
      return out;
    };
    const header = await boxes(table.getByRole("columnheader"));
    const firstRow = await boxes(table.getByRole("row").nth(1).getByRole("cell"));
    expect(header.length).toBe(8);
    expect(firstRow.slice(0, 8)).toEqual(header);
  }
});
