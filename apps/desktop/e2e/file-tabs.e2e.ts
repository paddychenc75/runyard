import type { Page } from "@playwright/test";
import { openMany } from "./support/file-tabs-fixture.ts";
import { expect, test } from "./support/fixtures.ts";

async function editorScroll(page: Page, set = false) {
  return page.evaluate(async (move) => {
    const runtime = await (
      window as unknown as {
        __runyardEditorRuntime: Promise<{
          monaco: {
            editor: {
              getEditors(): {
                getScrollTop(): number;
                getScrollLeft(): number;
                setScrollTop(value: number): void;
              }[];
            };
          };
        }>;
      }
    ).__runyardEditorRuntime;
    const editor = runtime.monaco.editor.getEditors()[0];
    if (!editor) throw new Error("No editor");
    if (move) editor.setScrollTop(240);
    return { page: scrollY, top: editor.getScrollTop(), left: editor.getScrollLeft() };
  }, set);
}
test("[DESKTOP-EDITOR-93] 多文件标签触控板与鼠标滚动且隐藏滚动条", async ({ launch }) => {
  const runyard = await launch();
  const { page } = runyard;
  const names = await openMany(runyard);
  const tabs = page.getByRole("tablist", { name: "File tabs" });
  await expect(tabs.getByRole("tab")).toHaveCount(13);
  await page.getByRole("treeitem", { name: names[0], exact: true }).click();
  const metrics = () =>
    tabs.evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
      left: el.scrollLeft,
      overflow: getComputedStyle(el).overflowX,
    }));

  await expect
    .poll(async () => (await metrics()).scroll - (await metrics()).width)
    .toBeGreaterThan(0);
  await editorScroll(page, true);
  await expect.poll(async () => (await editorScroll(page)).top).toBeGreaterThan(0);
  const outside = await editorScroll(page);
  const selected = await tabs.getByRole("tab", { selected: true }).getAttribute("data-path");
  const horizontal = tabs.locator("..").locator(':scope > [data-orientation="horizontal"]');
  await expect(horizontal).toHaveCount(1);
  await expect(horizontal).toHaveCSS("visibility", "hidden");
  await tabs.hover();
  const before = (await metrics()).left;
  await page.mouse.wheel(350, 0);
  await expect.poll(async () => (await metrics()).left).toBeGreaterThan(before);
  const first = (await metrics()).left;
  await page.mouse.wheel(0, 250);
  await expect.poll(async () => (await metrics()).left).toBeGreaterThan(first);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await metrics()).left).toBeLessThan(first + 250);
  await page.mouse.wheel(0, 10000);
  // scrollWidth/clientWidth按整数取整，最终可达性直接量最后标签的完整边界。
  await expect
    .poll(() =>
      tabs.evaluate((view) => {
        const buttons = view.querySelectorAll('[role="tab"]');
        const last = buttons[buttons.length - 1]?.parentElement;
        return last ? last.getBoundingClientRect().right - view.getBoundingClientRect().right : 100;
      }),
    )
    .toBeLessThanOrEqual(1);
  await page.mouse.wheel(0, 10000);
  expect(await editorScroll(page)).toEqual(outside);
  expect(await tabs.getByRole("tab", { selected: true }).getAttribute("data-path")).toBe(selected);
  await page.mouse.wheel(0, -10000);
  await expect.poll(async () => (await metrics()).left).toBe(0);
  const vertical = page
    .getByRole("tree")
    .locator('xpath=ancestor::*[@data-orientation="vertical"]')
    .first();
  await expect(vertical).not.toHaveAttribute("data-scrollbars", "hidden");
});

test("[DESKTOP-EDITOR-94] 恢复和缩窄显示激活标签，超长名保留关闭与完整名称", async ({ launch }) => {
  const runyard = await launch();
  const { page, app } = runyard;
  const names = await openMany(runyard, true);
  const tabs = page.getByRole("tablist", { name: "File tabs" });
  const visible = async () =>
    tabs.evaluate((view) => {
      const active = view.querySelector("[data-selected]");
      if (!active) return false;
      const v = view.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      return item.left >= v.left - 1 && item.right <= v.right + 1;
    });
  await expect.poll(visible).toBe(true);
  const longName = names.at(-1) ?? "";
  const longTab = tabs.getByRole("tab", { name: longName, exact: true });
  await tabs.focus();
  for (let index = 0; index < names.length * 2 + 4; index++) {
    await page.keyboard.press("Tab");
    if (await longTab.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(longTab).toBeFocused();
  await expect(
    page.locator('[data-glass-material="menu"]').filter({ hasText: longName }),
  ).toBeVisible();
  await expect(tabs.getByRole("button", { name: `Close ${longName}`, exact: true })).toBeInViewport(
    { ratio: 1 },
  );
  await page.getByRole("treeitem", { name: names[11], exact: true }).click();
  await expect.poll(visible).toBe(true);
  const width = await tabs.evaluate((el) => el.clientWidth);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(900, 800),
  );
  await expect.poll(() => tabs.evaluate((el) => el.clientWidth)).toBeLessThan(width);
  await expect.poll(visible).toBe(true);
  await page.reload();
  await expect(tabs.getByRole("tab", { selected: true })).toHaveAttribute(
    "data-path",
    names[11] ?? "",
  );
  await expect.poll(visible).toBe(true);
  await page.getByRole("treeitem", { name: names[0], exact: true }).click();
  await expect.poll(visible).toBe(true);
});
