import { closePicker, expect, test } from "./support/fixtures.ts";

for (const theme of ["light", "dark"] as const) {
  test(`[DESKTOP-LIBRARY-VIEW-30][DESKTOP-LIBRARY-VIEW-96] ${theme}：鼠标轻选中，键盘焦点可见，失焦保留选择`, async ({
    launch,
  }) => {
    const runyard = await launch();
    const { page } = runyard;
    await closePicker(page);
    await runyard.call("settings.set", { theme });
    await runyard.cli("new", "html", "selection-demo");
    const table = page.getByRole("table", { name: "Playgrounds" });
    const row = table.getByRole("row").filter({ hasText: "selection-demo" });
    await row.locator('td[data-column="name"]').click();
    await expect(row).toHaveAttribute("data-selected", "");
    await expect(table).toBeFocused();
    await expect.poll(() => row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    const active = await row.evaluate((el) => getComputedStyle(el).backgroundImage);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.keyboard.press("Tab");
    await expect(row.getByRole("button", { name: "Open", exact: true })).toBeFocused();
    await page.getByRole("textbox", { name: "Search playgrounds" }).click();
    await expect(row).toHaveAttribute("data-selected", "");
    await expect
      .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundImage))
      .not.toBe(active);
    await expect.poll(() => row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  });
}
