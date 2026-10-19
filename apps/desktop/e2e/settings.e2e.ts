import { closePicker, expect, test } from "./support/fixtures.ts";
import { openSettingsPage } from "./support/settings-page.ts";

test("设置：切换主题和语言立即生效并保存", async ({ launch }) => {
  const runyard = await launch({ lang: "en", theme: "light" });
  await closePicker(runyard.page);
  const page = await openSettingsPage(runyard);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() => runyard.call<{ theme: string }>("settings.get"))
    .toMatchObject({ theme: "dark" });

  // 系统画的菜单和窗口外框也跟着主题走
  await expect
    .poll(() => runyard.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe("dark");

  await page.getByRole("button", { name: "Simplified Chinese" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(runyard.page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { name: "设置", level: 1 })).toBeVisible();
  await expect
    .poll(() => runyard.call<{ language?: string }>("settings.get"))
    .toMatchObject({ language: "zh-CN" });

  // 应用菜单也跟着换语言
  await expect
    .poll(() =>
      runyard.app.evaluate(({ Menu }) => {
        const items =
          Menu.getApplicationMenu()?.items.flatMap((item) => item.submenu?.items ?? []) ?? [];
        return items.find((item) => item.accelerator === "CmdOrCtrl+N")?.label;
      }),
    )
    .toMatch(/新建/);
});

test("[DESKTOP-SETTINGS-22] 打好的包里导出诊断信息：生成诊断包并在访达里选中", async ({
  launch,
}) => {
  const runyard = await launch({ lang: "zh-CN", theme: "light" });
  // 不真的弹出访达：把 shell.showItemInFolder 换成记录
  await runyard.app.evaluate(({ shell }) => {
    (globalThis as { revealed?: string[] }).revealed = [];
    shell.showItemInFolder = (path: string) => {
      (globalThis as { revealed?: string[] }).revealed?.push(path);
    };
  });
  const outcome = await runyard.call<{ ok: boolean }>("diagnostics.export");
  expect(outcome).toEqual({ ok: true });
  const revealed = await runyard.app.evaluate(
    () => (globalThis as { revealed?: string[] }).revealed ?? [],
  );
  expect(revealed).toHaveLength(1);
  expect(revealed[0]).toMatch(/runyard-doctor-.*\.zip$/);
});

test("[DESKTOP-SETTINGS-35] 标题固定、滚动高亮和细线，行距符合单列设计", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  const page = await openSettingsPage(runyard);
  await page.setViewportSize({ width: 820, height: 900 });
  const header = page.locator("[data-settings-header]");
  await expect(header).toBeVisible();
  const before = await header.boundingBox();
  expect(before?.height).toBe(88);
  await expect(header).toHaveAttribute("data-scrolled", "false");
  const column = page.locator("[data-settings-column]");
  expect((await column.boundingBox())?.width).toBe(720);
  const metrics = await page.locator("[data-settings-row]").evaluateAll((rows) =>
    rows.map((row) => {
      const text = row.firstElementChild;
      const control = row.lastElementChild;
      return {
        height: row.getBoundingClientRect().height,
        gap:
          text === control
            ? 24
            : (control?.getBoundingClientRect().left ?? 0) -
              (text?.getBoundingClientRect().right ?? 0),
      };
    }),
  );
  expect(metrics.length).toBeGreaterThan(10);
  for (const metric of metrics) {
    expect(metric.height).toBeGreaterThanOrEqual(54);
    expect(metric.gap).toBeGreaterThanOrEqual(24);
  }
  await page.locator("#settings-viewport").evaluate((node) => {
    const group = node.querySelector('[data-settings-section="deps"]');
    if (group)
      node.scrollTop += group.getBoundingClientRect().top - node.getBoundingClientRect().top;
  });
  await expect(header.getByRole("button", { name: "Dependencies and network" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await expect(header).toHaveAttribute("data-scrolled", "true");
  expect(await header.boundingBox()).toEqual(before);
  await page.locator("#settings-viewport").evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(header).toHaveAttribute("data-scrolled", "false");
  await expect(header.getByRole("button", { name: "General", exact: true })).toHaveAttribute(
    "aria-current",
    "location",
  );
});

test("[DESKTOP-SETTINGS-36] 分区跳转贴住标题区，最后一组不足时滚到底", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  const page = await openSettingsPage(runyard);
  await page.setViewportSize({ width: 820, height: 900 });
  const header = page.locator("[data-settings-header]");
  await header.getByRole("button", { name: "Editing and running" }).click();
  const bounds = await header.boundingBox();
  const editing = await page.locator('[data-settings-section="editRun"]').boundingBox();
  expect(
    Math.abs((editing?.y ?? 0) - ((bounds?.y ?? 0) + (bounds?.height ?? 0))),
  ).toBeLessThanOrEqual(1);
  await header.getByRole("button", { name: "Runtime", exact: true }).click();
  await expect(header.getByRole("button", { name: "Runtime", exact: true })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await header.getByRole("button", { name: "Command line and agents" }).click();
  await expect(header.getByRole("button", { name: "Command line and agents" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await expect
    .poll(() =>
      page
        .locator("#settings-viewport")
        .evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop),
    )
    .toBeLessThanOrEqual(1);
});

test("[DESKTOP-SETTINGS-36] 最小760宽英文导航键盘可到最后一项，页面不横向溢出", async ({
  launch,
}) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  const page = await openSettingsPage(runyard);
  await page.setViewportSize({ width: 760, height: 900 });
  const header = page.locator("[data-settings-header]");
  await page.bringToFront();
  await header.getByRole("button", { name: "General", exact: true }).focus();
  for (let index = 0; index < 4; index++) await page.keyboard.press("Tab");
  const last = header.getByRole("button", { name: "Command line and agents" });
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport({ ratio: 1 });
  const focusSpace = await last.evaluate((button) => {
    const viewport = button.closest(".base-ui-disable-scrollbar");
    if (!viewport) throw new Error("分区按钮缺少滚动视口");
    const bounds = button.getBoundingClientRect();
    const clip = viewport.getBoundingClientRect();
    return {
      left: bounds.left - clip.left,
      right: clip.right - bounds.right,
      top: bounds.top - clip.top,
      bottom: clip.bottom - bounds.bottom,
    };
  });
  for (const space of Object.values(focusSpace)) expect(space).toBeGreaterThanOrEqual(4);
  await page.keyboard.press("Enter");
  await expect(last).toHaveAttribute("aria-current", "location");
  expect(await header.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
  expect(
    await page
      .locator("#settings-viewport")
      .evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBe(0);
});
