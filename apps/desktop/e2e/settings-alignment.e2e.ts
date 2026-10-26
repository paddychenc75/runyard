import type { Locator } from "@playwright/test";
import { expect, test } from "./support/fixtures.ts";
import { settingsGeometry } from "./support/settings-geometry.ts";
import { installSettingsLayoutFixture, LONG_TOOL_PATH } from "./support/settings-layout-fixture.ts";
import { openSettingsPage } from "./support/settings-page.ts";

async function expectFocusSpace(button: Locator) {
  const space = await button.evaluate((node) => {
    const viewport = node.closest(".base-ui-disable-scrollbar") as HTMLElement;
    const bounds = node.getBoundingClientRect();
    const clip = viewport.getBoundingClientRect();
    return {
      left: bounds.left - clip.left,
      right: clip.right - bounds.right,
      top: bounds.top - clip.top,
      bottom: clip.bottom - bounds.bottom,
    };
  });
  for (const value of Object.values(space)) expect(value).toBeGreaterThanOrEqual(4);
}

for (const theme of ["light", "dark"] as const) {
  for (const lang of ["en", "zh-CN"] as const) {
    test(`[DESKTOP-SETTINGS-35] 设置对齐 ${theme}-${lang}：标题导航分组卡片同线且内容无重叠`, async ({
      launch,
    }, testInfo) => {
      const instance = await launch({ theme, lang });
      await expect(instance.page.getByRole("combobox")).toBeFocused();
      await instance.page.keyboard.press("Escape");
      await expect(instance.page.getByRole("dialog")).toHaveCount(0);
      await installSettingsLayoutFixture(instance);
      const page = await openSettingsPage(instance);
      const path = page.getByRole("textbox", {
        name: lang === "en" ? "Node executable path" : "Node 可执行文件路径",
      });
      await expect(path).toHaveValue(LONG_TOOL_PATH);
      await path.fill(`${LONG_TOOL_PATH}-draft`);
      const main = await instance.app.browserWindow(page);
      for (const width of [1440, 1100, 900, 720]) {
        await main.evaluate((window, width) => window.setContentSize(width, 900), width);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
        await expect(page.locator("[data-sidebar]")).toHaveAttribute(
          "data-sidebar",
          width <= 900 ? "hidden" : "shown",
        );
        const navigation = page.locator("[data-settings-header]").getByRole("button");
        await navigation.first().focus();
        for (let index = 0; index < 4; index++) await page.keyboard.press("Tab");
        await expect(navigation.last()).toBeFocused();
        await expect(navigation.last()).toBeInViewport({ ratio: 1 });
        await expectFocusSpace(navigation.last());
        for (let index = 0; index < 4; index++) await page.keyboard.press("Shift+Tab");
        await expect(navigation.first()).toBeFocused();
        await expect(navigation.first()).toBeInViewport({ ratio: 1 });
        await expectFocusSpace(navigation.first());
        const geometry = await settingsGeometry(page);
        console.log("SETTINGS_GEOMETRY", JSON.stringify({ width, theme, lang, geometry }));
        const lefts = [
          geometry.titleLeft,
          geometry.pillLeft,
          ...geometry.groups.flatMap((group) => [group.titleLeft, group.cardLeft]),
        ];
        expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.headingLeft - geometry.columnLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.headingWidth - geometry.columnWidth)).toBeLessThanOrEqual(1);
        expect(geometry.bodyOverflow).toBe(0);
        for (const group of geometry.groups) expect(group.titleGap).toBe(12);
        for (const row of geometry.rows) {
          expect(row.height).toBeGreaterThanOrEqual(64);
          expect(row.overflow).toBe(0);
          expect(row.textWidth).toBeGreaterThanOrEqual(160);
          expect(row.clippedControls).toEqual([]);
          expect(row.rightInset).toBeGreaterThanOrEqual(19);
          if (row.stacked) expect(row.verticalGap).toBeGreaterThanOrEqual(12);
          else if (row.gap !== null) expect(row.gap).toBeGreaterThanOrEqual(24);
        }
        const controls = await path.evaluate((node) => {
          const row = node.closest("tr") as HTMLElement;
          const box = row.getBoundingClientRect();
          return {
            inputWidth: node.getBoundingClientRect().width,
            inside: [...row.querySelectorAll("input,button")].every(
              (control) =>
                control.getBoundingClientRect().left >= box.left + 19 &&
                control.getBoundingClientRect().right <= box.right - 19,
            ),
          };
        });
        expect(controls.inputWidth).toBeGreaterThanOrEqual(180);
        expect(controls.inside).toBe(true);
        if (width === 720) {
          await path.scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`720-${theme}-${lang}-runtime.png`) });
          await navigation.last().click();
          await page.screenshot({ path: testInfo.outputPath(`720-${theme}-${lang}-cli.png`) });
        }
      }
    });
  }
}
