import { expect, type Page } from "@playwright/test";

/** #520：窄窗口允许自动收起；需要侧栏的用例通过真实按钮建立显示前提。 */
export async function showLibrarySidebar(page: Page): Promise<void> {
  const sidebar = page.locator("[data-library-sidebar]");
  console.log(
    "侧栏前置状态",
    JSON.stringify(
      await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        shellWidth: document.querySelector("[data-sidebar]")?.getBoundingClientRect().width,
        sidebar: document.querySelector("[data-sidebar]")?.getAttribute("data-sidebar"),
        navigationPresent: document.querySelector("[data-library-sidebar]") !== null,
      })),
    ),
  );
  if (!(await sidebar.isVisible())) {
    await page.getByRole("button", { name: /^(Show sidebar|显示侧栏)$/, exact: true }).click();
  }
  await expect(sidebar).toBeVisible();
}
