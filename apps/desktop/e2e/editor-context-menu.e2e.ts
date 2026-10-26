import { createWithKeyboard, expect, test } from "./support/fixtures.ts";

// 右键菜单在 shadow DOM 里（宿主 .shadow-root-host），页面里的定位器能穿透 shadow，但读样式要自己进去取
const menuState = () => {
  const root = document.querySelector(".shadow-root-host")?.shadowRoot;
  const menu = root?.querySelector(".monaco-menu") as HTMLElement | null;
  if (!menu) return null;
  const cs = getComputedStyle(menu);
  const labels = [...menu.querySelectorAll(".action-item:not(.disabled) .action-label")];
  const keybinding = menu.querySelector(".keybinding")?.getBoundingClientRect();
  const rect = menu.getBoundingClientRect();
  return {
    background: cs.backgroundColor,
    radius: Number.parseFloat(cs.borderTopLeftRadius),
    shadow: cs.boxShadow,
    text: getComputedStyle(labels[0] as Element).color,
    keybindingInside:
      keybinding !== undefined && keybinding.right <= rect.right && rect.right <= innerWidth,
  };
};

const alpha = (color: string) => {
  const m = /rgba\(.*,\s*([\d.]+)\)$/.exec(color);
  return m ? Number(m[1]) : 1;
};

const previewVisible = (app: import("@playwright/test").ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    const preview = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith("http://127.0.0.1:"));
    const window = BrowserWindow.getAllWindows()[0];
    const view = window?.contentView.children.find(
      (child) => (child as unknown as { webContents?: unknown }).webContents === preview,
    ) as unknown as { getVisible(): boolean } | undefined;
    return view?.getVisible() ?? null;
  });

for (const theme of ["light", "dark"] as const) {
  test(`[DESKTOP-EDITOR-101] [DESKTOP-EDITOR-102] [DESKTOP-EDITOR-103] 右键菜单外观与预览让位：${theme}`, async ({
    launch,
  }) => {
    const { page, app } = await launch({ lang: "en", theme });
    await createWithKeyboard(page);
    await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/:\d+/);
    await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
    const editor = page.locator(".monaco-editor .view-lines").first();
    await expect(editor).toContainText("doctype");
    await expect.poll(() => previewVisible(app)).toBe(true);

    // 点在编辑器偏右的位置：菜单会伸到右边的预览所在区域
    await editor.click({ button: "right", position: { x: 500, y: 200 } });
    await expect(page.getByRole("menuitem", { name: /Command Palette/ })).toBeVisible();
    const state = await page.evaluate(menuState);
    expect(state).not.toBeNull();
    expect(alpha(state?.background ?? "")).toBeGreaterThan(0.5);
    expect(state?.radius).toBeGreaterThanOrEqual(8);
    expect(state?.shadow).not.toBe("none");
    expect(state?.text).not.toBe(state?.background);
    expect(state?.keybindingInside).toBe(true);
    // 深色下字要亮、浅色下字要暗
    const channel = (state?.text.match(/\d+/g) ?? []).map(Number)[0] ?? 0;
    if (theme === "dark") expect(channel).toBeGreaterThan(180);
    else expect(channel).toBeLessThan(90);

    // 不可用项：把一项标成不可用（Monaco 的这份菜单里没有现成的不可用文字项），样式应让它变灰
    const colors = await page.evaluate(() => {
      const root = document.querySelector(".shadow-root-host")?.shadowRoot;
      const items = [...(root?.querySelectorAll(".action-item:not(.disabled)") ?? [])];
      const normal = getComputedStyle(items[0]?.querySelector(".action-label") as Element).color;
      items[0]?.classList.add("disabled");
      const grey = getComputedStyle(items[0]?.querySelector(".action-label") as Element).color;
      return { normal, grey };
    });
    expect(colors.grey).not.toBe(colors.normal);

    // 菜单打开期间预览让位
    await expect.poll(() => previewVisible(app)).toBe(false);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: /Command Palette/ })).toHaveCount(0);
    await expect.poll(() => previewVisible(app)).toBe(true);
  });
}
