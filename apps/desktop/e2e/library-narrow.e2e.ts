import { closePicker, expect, pressMenuShortcut, test } from "./support/fixtures.ts";

test("[DESKTOP-LIBRARY-VIEW-97][DESKTOP-LIBRARY-VIEW-98][DESKTOP-LIBRARY-VIEW-99] 极窄侧栏覆盖、焦点和手动偏好", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page, app } = runyard;
  await closePicker(page);
  await runyard.cli("new", "html", "narrow-project");
  const resize = async (width: number) => {
    await app.evaluate(
      ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setContentSize(w, 800),
      width,
    );
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  };
  const nav = page.getByRole("navigation", { name: "Library navigation" });
  const show = page.getByRole("button", { name: "Show sidebar" });
  const search = page.getByRole("textbox", { name: "Search playgrounds" });
  const table = page.getByRole("table", { name: "Playgrounds" });
  const saved = () => page.evaluate(() => localStorage.getItem("runyard.layout.v1"));
  await resize(1440);
  const initialToggleBox = await page.getByRole("button", { name: "Hide sidebar" }).boundingBox();
  await search.focus();
  const before = await saved();
  await resize(720);
  await expect(nav).toHaveCount(0);
  await expect(search).toBeFocused();
  const libraryToggleBox = await show.boundingBox();
  expect(libraryToggleBox?.x).toBe(initialToggleBox?.x);
  expect(libraryToggleBox?.y).toBe(initialToggleBox?.y);
  const width = (await table.boundingBox())?.width;
  await show.click();
  await expect(nav.locator('[aria-current="page"]')).toBeFocused();
  expect((await table.boundingBox())?.width).toBe(width);
  await page.keyboard.press("Escape");
  await expect(show).toBeFocused();
  await pressMenuShortcut(app, "Ctrl+Cmd+S");
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: /^All/ }).click();
  await expect(nav).toHaveCount(0);
  await expect(show).toBeFocused();
  expect(await saved()).toBe(before);
  await resize(1100);
  await expect(nav).toBeVisible();
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  const collapsed = await saved();
  await resize(720);
  await show.click();
  await resize(1440);
  await expect(show).toBeFocused();
  expect(await saved()).toBe(collapsed);
  await resize(720);
  await show.click();
  await nav.getByRole("button", { name: /^Templates/ }).click();
  await expect(nav).toBeVisible();
  const toggleBox = await page.getByRole("button", { name: "Hide sidebar" }).boundingBox();
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(show).toBeFocused();
  const collapsedBox = await show.boundingBox();
  expect(collapsedBox?.x).toBe(toggleBox?.x);
  expect(collapsedBox?.y).toBe(toggleBox?.y);
  await show.click();
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: /^All/ }).click();
  await expect(nav).toHaveCount(0);
  await resize(1440);
  await page.reload();
  await expect(show).toBeVisible();
  await expect(nav).toHaveCount(0);
  expect(await saved()).toBe(collapsed);
});
