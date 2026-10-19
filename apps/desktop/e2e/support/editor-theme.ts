import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator } from "@playwright/test";
import type { RunyardApp } from "./launch.ts";

export async function openScrollableEditor(instance: RunyardApp): Promise<void> {
  const page = instance.page;
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await instance.cli("new", "html", "theme-demo");
  await expect(page.getByRole("row", { name: /theme-demo/ })).toBeVisible();
  const folder = join(instance.library, "theme-demo");
  writeFileSync(
    join(folder, "index.html"),
    `<!doctype html>\n<h1>Theme check</h1>\n${Array.from({ length: 300 }, (_, i) => `<!-- row ${i} -->`).join("\n")}`,
  );
  for (let i = 0; i < 65; i++)
    writeFileSync(join(folder, `zz-${String(i).padStart(2, "0")}.txt`), "fixture\n");
  const state = await instance.call<{ playgrounds: { id: string; name: string }[] }>("library.get");
  const id = state.playgrounds.find((row) => row.name === "theme-demo")?.id;
  if (!id) throw new Error("主题验证项目未就绪");
  await instance.call("tab.open", id);
  await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("Theme check");
}

/** 按浏览器实际渲染的8位RGBA比色，避开CSS rgba与主题十六进制的序列化差异。 */
async function color(locator: Locator): Promise<number[]> {
  return locator.evaluate(async (element) => {
    getComputedStyle(element).backgroundColor;
    // #454：切换主题可以取消上一条过渡，等待结束或取消后读取当下颜色。
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("缺少颜色测量画布");
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
}
export async function compareScrollbars(instance: RunyardApp, theme: "light" | "dark") {
  const page = instance.page;
  await instance.call("settings.set", { theme });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const monaco = page
    .locator(".monaco-editor .editor-scrollable > .scrollbar.vertical > .slider")
    .first();
  const area = page.getByRole("tree").locator("xpath=ancestor::*[@data-orientation='vertical'][1]");
  const shared = area.locator(":scope > [data-orientation='vertical'] > div").first();
  await expect(shared).toBeAttached();
  await expect(monaco).toBeAttached();
  await page.mouse.move(20, 20);
  const sharedBase = await color(shared);
  await expect.poll(() => color(monaco)).toEqual(sharedBase);
  expect(sharedBase[3]).toBeGreaterThan(0);
  // 先滚动唤醒自动隐藏的滑块，然后按真实指针悬停触发共享控件的悬停态。
  await page.getByRole("tree").hover();
  await page.mouse.wheel(0, 180);
  await shared.hover();
  const sharedHover = await color(shared);
  await page.locator(".monaco-editor .view-lines").first().hover();
  await page.mouse.wheel(0, 220);
  await monaco.hover();
  const monacoHover = await color(monaco);
  expect(monacoHover).toEqual(sharedHover);
  expect(sharedHover[3]).toBeGreaterThan(sharedBase[3] ?? 0);
  return { sharedBase, monacoBase: sharedBase, sharedHover, monacoHover, monaco, shared };
}
