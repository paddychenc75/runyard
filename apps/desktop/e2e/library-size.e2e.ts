import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFormat, createTranslator, desktopCatalogs } from "@runyard/i18n";
import type { LibraryState } from "../src/shared/library-state.ts";
import { closePicker, expect, test } from "./support/fixtures.ts";

// 真文件触发后台队列与监听，不用注入大小状态；数据只写launch创建的临时资源库。
test("[LIBRARY-DISK-USAGE-14][DESKTOP-LIBRARY-VIEW-69][DESKTOP-LIBRARY-VIEW-76] 真实大小、排序、依赖提示与覆盖侧栏合计更新", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page, app } = runyard;
  await closePicker(page);
  await runyard.cli("new", "html", "small-project");
  await runyard.cli("new", "html", "large-project");
  const root = join(runyard.library, "large-project");
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules", "data.bin"), randomBytes(1_000_000));
  await writeFile(join(root, "source.bin"), randomBytes(1_000_000));
  const state = () => runyard.call<LibraryState>("library.get");
  const largeSize = async () =>
    (await state()).playgrounds.find((row) => row.name === "large-project")?.size;
  await expect.poll(async () => (await largeSize())?.totalBytes ?? 0).toBeGreaterThan(2_000_000);
  await expect
    .poll(async () => (await largeSize())?.dependencyBytes ?? 0)
    .toBeGreaterThanOrEqual(1_000_000);
  const format = createFormat(
    createTranslator({ locale: "en", platform: "darwin", catalogs: desktopCatalogs }),
  );
  const large = page.locator("tr[data-row-id]").filter({ hasText: "large-project" });
  const cell = large.locator('[data-column="size"]');
  const first = await largeSize();
  await expect(cell).toHaveText(format.fileSize(first?.totalBytes ?? 0));
  await cell.locator("[data-user-content]").hover();
  await expect(page.getByText(/Dependencies .*node_modules/)).toBeVisible();
  await page.getByRole("button", { name: "Size", exact: true }).click();
  await expect(page.locator("tbody tr[data-row-id]").first()).toContainText("large-project");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 800),
  );
  await expect(page.getByRole("navigation", { name: "Library navigation" })).toHaveCount(0);
  const show = page.getByRole("button", { name: "Show sidebar" });
  await show.click();
  const footer = page.locator("[data-library-sidebar]").getByText(/2 playgrounds/);
  await expect(footer).toContainText("MB");
  const before = await footer.innerText();
  await writeFile(join(root, "source.bin"), randomBytes(3_000_000));
  await expect
    .poll(async () => (await largeSize())?.totalBytes ?? 0)
    .toBeGreaterThan((first?.totalBytes ?? 0) + 1_500_000);
  await expect(footer).not.toHaveText(before);
  const rows = (await state()).playgrounds;
  const total = rows.reduce((bytes, row) => bytes + (row.size?.totalBytes ?? 0), 0);
  await expect(footer).toContainText(format.fileSize(total));
  await page.keyboard.press("Escape");
  await expect(cell).toHaveText(format.fileSize((await largeSize())?.totalBytes ?? 0));
});
