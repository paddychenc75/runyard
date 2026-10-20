import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { closePicker, expect } from "./fixtures.ts";
import type { RunyardApp } from "./launch.ts";

/** 正常打开万文件项目；不提前调用索引或打开快速打开面板。 */
export async function prepareQuickOpen(instance: RunyardApp) {
  const { page } = instance;
  await closePicker(page);
  await instance.cli("new", "html", "large-project");
  const directory = join(instance.library, "large-project", "files");
  mkdirSync(directory);
  for (const prefix of ["z", "ze", "zet", "zeta"]) {
    for (let index = 0; index < 2500; index++) {
      writeFileSync(
        join(directory, `${prefix}${String(index).padStart(4, "0")}.txt`),
        `${prefix}:${index}\n`,
      );
    }
  }
  const generatedFiles = readdirSync(directory).length;
  expect(generatedFiles).toBe(10000);
  const state = () => instance.call<{ playgrounds: { id: string; name: string }[] }>("library.get");
  await expect.poll(async () => (await state()).playgrounds.length).toBe(1);
  await instance.call("tab.openWithoutRun", (await state()).playgrounds[0]?.id);
  // 建立真实最近文件列表；不提前打开快速打开，也不额外请求/预热files.listAll。
  await page.getByRole("treeitem", { name: "style.css", exact: true }).click();
  await expect(page.getByRole("tab", { name: "style.css", exact: true })).toBeVisible();
  await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
  await page.locator(".monaco-editor .view-lines").first().click();
  return generatedFiles;
}
