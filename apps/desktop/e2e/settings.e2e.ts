import { expect, test } from "./support/fixtures.ts";

test("设置：切换主题和语言立即生效并保存", async ({ launch }) => {
  const runyard = await launch({ lang: "en", theme: "light" });
  const { page } = runyard;
  // 空资源库会自动打开选择器：关掉再进设置
  await expect(page.getByRole("dialog", { name: "Choose a template" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
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
