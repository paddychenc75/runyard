import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWithKeyboard, expect, previewText, test } from "./support/fixtures.ts";

test("HTML 项目：在编辑器里改文件，自动保存写到磁盘，预览跟着更新", async ({ launch }) => {
  const runyard = await launch();
  const { page, app } = runyard;
  await createWithKeyboard(page);
  await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/:\d+/);
  await expect.poll(() => previewText(app)).toContain("Clicked 0 times");

  await page.getByRole("treeitem", { name: "index.html" }).click();
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("<h1>E2E-EDITED</h1>");
  // 默认“停下 1 秒后自动保存”：不按保存键，文件也会落盘
  await expect
    .poll(() => readFileSync(join(runyard.library, "html-1", "index.html"), "utf8"))
    .toContain("E2E-EDITED");
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect.poll(() => previewText(app)).toContain("E2E-EDITED");
});
