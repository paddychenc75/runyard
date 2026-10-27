import type { Page } from "@playwright/test";
import { closePicker, expect, test } from "./support/fixtures.ts";

// 资源库表头排序（#575，规格 DESKTOP-LIBRARY-VIEW-109 至 112）。截图只在设了 RUNYARD_SORT575_OUT 时输出。

async function prepare(
  runyard: Awaited<ReturnType<Parameters<Parameters<typeof test>[2]>[0]["launch"]>>,
) {
  const { page, app } = runyard;
  await closePicker(page);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
  });
  // 依次创建：后建的最近使用更新
  for (const name of ["alpha", "beta", "gamma"]) await runyard.cli("new", "html", name);
  await expect(page.locator("tbody tr[data-row-id]")).toHaveCount(3);
}

// 名称格后面可能挂着创建者徽标，只取项目名开头
const names = (page: Page) =>
  page
    .locator("tbody tr[data-row-id] td[data-column='name']")
    .evaluateAll((cells) =>
      cells.map((cell) => /^(alpha|beta|gamma)/.exec(cell.textContent ?? "")?.[1] ?? ""),
    );

test("[DESKTOP-LIBRARY-VIEW-109][DESKTOP-LIBRARY-VIEW-110][DESKTOP-LIBRARY-VIEW-112] 点表头切换方向、顺序随之变化；鼠标点击没有焦点环，键盘焦点才有且不被裁切", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page } = runyard;
  await prepare(runyard);

  const recent = page.locator('th[data-column="lastUsed"]');
  const recentButton = recent.getByRole("button");
  await expect(recent).toHaveAttribute("aria-sort", "descending");
  expect(await names(page)).toEqual(["gamma", "beta", "alpha"]);

  // 悬停：手形指针、有底色和提示
  await recentButton.hover();
  expect(await recentButton.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
  await expect(recentButton).toHaveAttribute("title", /ascending/);
  await expect
    .poll(() => recentButton.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");

  // 点当前排序列：升序，最旧在前；下拉里也写方向
  await recentButton.click();
  await expect(recent).toHaveAttribute("aria-sort", "ascending");
  expect(await names(page)).toEqual(["alpha", "beta", "gamma"]);
  await expect(page.getByRole("button", { name: "Sort: Last used ↑" })).toBeVisible();
  // 鼠标点击后没有焦点环
  expect(await recentButton.evaluate((el) => el.matches(":focus-visible"))).toBe(false);
  expect(await recentButton.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");

  await recentButton.click();
  await expect(recent).toHaveAttribute("aria-sort", "descending");
  expect(await names(page)).toEqual(["gamma", "beta", "alpha"]);

  // 名称默认 A 到 Z，再点倒过来
  const name = page.locator('th[data-column="name"]');
  await name.getByRole("button").click();
  await expect(name).toHaveAttribute("aria-sort", "ascending");
  expect(await names(page)).toEqual(["alpha", "beta", "gamma"]);
  await name.getByRole("button").click();
  await expect(name).toHaveAttribute("aria-sort", "descending");
  expect(await names(page)).toEqual(["gamma", "beta", "alpha"]);

  // 键盘操作后的焦点：有焦点环，环的四边都在表头行内（不被裁切）
  await page.keyboard.press("Tab");
  const nameButton = name.getByRole("button");
  await nameButton.focus();
  expect(await nameButton.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  expect(await nameButton.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  const inside = await nameButton.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const head = (el.closest("thead") as HTMLElement).getBoundingClientRect();
    const width = Number.parseFloat(getComputedStyle(el).outlineWidth);
    const offset = Number.parseFloat(getComputedStyle(el).outlineOffset);
    const ring = Math.max(0, width + offset);
    return box.top - ring >= head.top && box.bottom + ring <= head.bottom;
  });
  expect(inside).toBe(true);
});
