import { test as base, expect, type Page } from "@playwright/test";
import { type LaunchOptions, launchRunyard, type RunyardApp } from "./launch.ts";

// 每个用例自己起应用；用例结束（无论成败）一定收尾并核对进程。
export const test = base.extend<{ launch: (options?: LaunchOptions) => Promise<RunyardApp> }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright 要求第一个参数写成解构
  launch: async ({}, use) => {
    const started: RunyardApp[] = [];
    await use(async (options) => {
      const instance = await launchRunyard(options);
      started.push(instance);
      return instance;
    });
    const problems: unknown[] = [];
    for (const instance of started) {
      await instance.shutdown().catch((error: unknown) => problems.push(error));
    }
    if (problems.length > 0) throw problems[0];
  },
});

export { expect };

/** 预览是主进程里另一个网页（不在界面的页面里）：取它的正文文字 */
export async function previewText(app: RunyardApp["app"]): Promise<string | null> {
  return app.evaluate(async ({ webContents }) => {
    const preview = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith("http://127.0.0.1:"));
    if (preview === undefined) return null;
    return (await preview.executeJavaScript("document.body.innerText")) as string;
  });
}

/** 触发带这个快捷键的菜单项：菜单项是系统层的，页面里按键到不了它，等同于按下该快捷键 */
export async function pressMenuShortcut(
  app: RunyardApp["app"],
  accelerator: string,
): Promise<void> {
  await app.evaluate(({ Menu }, wanted) => {
    const items =
      Menu.getApplicationMenu()?.items.flatMap((item) => item.submenu?.items ?? []) ?? [];
    const found = items.find((item) => item.accelerator === wanted);
    if (found === undefined) throw new Error(`no menu item with ${wanted}`);
    found.click();
  }, accelerator);
}

/** 新建流程只用键盘：模板选择器里可选输入搜索词，回车选中，再回车创建并运行 */
export async function createWithKeyboard(page: Page, search?: string): Promise<void> {
  // 对话框出现了不等于焦点已经到位：先等输入框拿到焦点再按键，否则回车会丢
  await expect(page.getByRole("combobox", { name: "Search templates" })).toBeFocused();
  if (search !== undefined) {
    await page.keyboard.type(search);
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option", { selected: true })).toBeVisible();
  }
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
  await page.keyboard.press("Enter");
}

export async function attachScreenshot(
  page: Page,
  info: { attach: (name: string, options: { body: Buffer; contentType: string }) => Promise<void> },
  name: string,
): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
}
