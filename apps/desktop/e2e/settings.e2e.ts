import { closePicker, expect, pressMenuShortcut, test } from "./support/fixtures.ts";
import { openSettingsWindow } from "./support/settings-window.ts";

test("设置：切换主题和语言立即生效并保存", async ({ launch }) => {
  const runyard = await launch({ lang: "en", theme: "light" });
  await closePicker(runyard.page);
  const page = await openSettingsWindow(runyard);
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
  const page = await openSettingsWindow(runyard);
  await page.setViewportSize({ width: 820, height: 900 });
  const header = page.locator("[data-settings-header]");
  await expect(header).toBeVisible();
  const before = await header.boundingBox();
  expect(before?.height).toBe(140);
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
  const page = await openSettingsWindow(runyard);
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
  const page = await openSettingsWindow(runyard);
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

test("[DESKTOP-SETTINGS-01] [DESKTOP-SETTINGS-37] 侧栏打开独立设置，快捷键复用一个窗口", async ({
  launch,
}) => {
  const runyard = await launch();
  const main = runyard.page;
  await closePicker(main);
  const opened = runyard.app.waitForEvent("window");
  await main.getByRole("button", { name: "Settings", exact: true }).click();
  const page = await opened;
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(main.getByRole("tab", { name: /Library/ })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+,");
  expect(runyard.app.windows()).toHaveLength(2);
  const window = await runyard.app.browserWindow(page);
  const closeItem = () =>
    runyard.app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()
        ?.items.flatMap((top) => top.submenu?.items ?? [])
        .find((item) => item.accelerator === "CmdOrCtrl+W");
      return { label: item?.label, enabled: item?.enabled };
    });
  await expect.poll(closeItem).toEqual({ label: "Close Window", enabled: true });
  const mainWindow = await runyard.app.browserWindow(main);
  await mainWindow.evaluate((window) => window.focus());
  await expect.poll(closeItem).toEqual({ label: "Close Tab", enabled: false });
  await window.evaluate((window) => window.focus());
  await expect.poll(closeItem).toEqual({ label: "Close Window", enabled: true });
  expect(
    await window.evaluate((window) => ({
      focused: window.isFocused(),
      fullscreenable: window.isFullScreenable(),
      min: window.getMinimumSize(),
      buttons: window.getWindowButtonPosition(),
    })),
  ).toEqual({ focused: true, fullscreenable: false, min: [760, 420], buttons: { x: 19, y: 19 } });
});

test("[DESKTOP-SETTINGS-38] [DESKTOP-SETTINGS-39] 打开与关闭设置都保留当前运行标签", async ({
  launch,
}) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  await runyard.cli("new", "html", "kept-project");
  await expect
    .poll(
      async () =>
        (await runyard.call<{ playgrounds: unknown[] }>("library.get")).playgrounds.length,
    )
    .toBe(1);
  const state = await runyard.call<{ playgrounds: { id: string }[] }>("library.get");
  const id = state.playgrounds[0]?.id;
  expect(id).toBeTruthy();
  await runyard.call("tab.open", id);
  await expect(runyard.page.getByRole("tab", { name: /kept-project/ })).toBeVisible();
  const before = await runyard.call<{ activeTab: string }>("library.get");
  const page = await openSettingsWindow(runyard);
  expect((await runyard.call<{ activeTab: string }>("library.get")).activeTab).toBe(
    before.activeTab,
  );
  const closed = page.waitForEvent("close");
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+W");
  await closed;
  expect(runyard.app.windows()).toHaveLength(1);
  expect((await runyard.call<{ activeTab: string }>("library.get")).activeTab).toBe(
    before.activeTab,
  );
  await expect(runyard.page.getByRole("tab", { name: /kept-project/ })).toBeVisible();
});

test("[DESKTOP-SETTINGS-40] 设置窗口关闭后恢复位置大小并同步两窗语言主题", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  const page = await openSettingsWindow(runyard);
  const window = await runyard.app.browserWindow(page);
  const area = await runyard.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await window.evaluate(
    (window, area) =>
      window.setBounds({
        x: area.x + 20,
        y: area.y + 20,
        width: 840,
        height: Math.min(800, area.height - 40),
      }),
    area,
  );
  const saved = await window.evaluate((window) => window.getBounds());
  await runyard.call("settings.set", { language: "zh-CN", theme: "dark" });
  await expect(page.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
  await expect(runyard.page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const closed = page.waitForEvent("close");
  await window.evaluate((window) => window.close());
  await closed;
  const reopened = await openSettingsWindow(runyard);
  const next = await runyard.app.browserWindow(reopened);
  expect(await next.evaluate((window) => window.getBounds())).toEqual(saved);
  await expect(reopened.getByRole("heading", { level: 1, name: "设置" })).toBeVisible();
});

test("[DESKTOP-SETTINGS-18] 两窗同时打开时路径选择框属于发起它的前台窗口", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  const page = await openSettingsWindow(runyard);
  await runyard.app.evaluate(({ dialog }) => {
    (globalThis as { pickerOwners?: number[] }).pickerOwners = [];
    dialog.showOpenDialog = async (window) => {
      (globalThis as { pickerOwners?: number[] }).pickerOwners?.push((window as { id: number }).id);
      return { canceled: true, filePaths: [] };
    };
  });
  const settings = await runyard.app.browserWindow(page);
  const main = await runyard.app.browserWindow(runyard.page);
  await page.bringToFront();
  await expect.poll(() => settings.evaluate((window) => window.isFocused())).toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as {
        runyard: { call: (method: string, param?: unknown) => Promise<unknown> };
      }
    ).runyard.call("toolchain.pickPath", "node"),
  );
  await main.evaluate((window) => {
    window.show();
    window.focus();
  });
  await expect.poll(() => main.evaluate((window) => window.isFocused())).toBe(true);
  await runyard.call("toolchain.pickPath", "node");
  const owners = await runyard.app.evaluate(
    () => (globalThis as { pickerOwners?: number[] }).pickerOwners,
  );
  expect(owners).toEqual([
    await settings.evaluate((window) => window.id),
    await main.evaluate((window) => window.id),
  ]);
});

test("[DESKTOP-SETTINGS-04] 深色设置窗口重开后改跟随系统，两窗仍同步", async ({ launch }) => {
  const runyard = await launch({ theme: "system" });
  await closePicker(runyard.page);
  const page = await openSettingsWindow(runyard);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const window = await runyard.app.browserWindow(page);
  const closed = page.waitForEvent("close");
  await window.evaluate((window) => window.close());
  await closed;
  const reopened = await openSettingsWindow(runyard);
  await expect(reopened.locator("html")).toHaveAttribute("data-theme", "dark");
  await reopened.getByRole("button", { name: "System", exact: true }).click();
  await expect(reopened.locator("html")).toHaveAttribute("data-theme", "system");
  await expect(runyard.page.locator("html")).toHaveAttribute("data-theme", "system");
  expect(await runyard.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe("system");
});

test("[DESKTOP-SETTINGS-38] 设置前台时新建先显示已隐藏的主窗口", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  const page = await openSettingsWindow(runyard);
  const main = await runyard.app.browserWindow(runyard.page);
  const settings = await runyard.app.browserWindow(page);
  await main.evaluate((window) => window.hide());
  await settings.evaluate((window) => window.focus());
  await pressMenuShortcut(runyard.app, "CmdOrCtrl+N");
  await expect
    .poll(() => main.evaluate((window) => window.isVisible() && window.isFocused()))
    .toBe(true);
  await expect(runyard.page.getByRole("dialog")).toBeVisible();
  expect(page.isClosed()).toBe(false);
});
