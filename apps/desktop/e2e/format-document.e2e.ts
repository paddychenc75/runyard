import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWithKeyboard, expect, test } from "./support/fixtures.ts";

const MESSY_TS = "function add( a:number,b:number ){return a+b}\nexport const x=add(1,2)\n";
const PYTHON = "x   =   1\n";

test("[DESKTOP-EDITOR-100] 真实窗口：TS 文件按 ⌥⇧F 格式化并保存到磁盘，Python 文件的菜单项不可用", async ({
  launch,
}) => {
  const runyard = await launch({ lang: "en" });
  const { page } = runyard;
  await createWithKeyboard(page);
  await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/:\d+/);
  const folder = join(runyard.library, "html-1");
  writeFileSync(join(folder, "App.ts"), MESSY_TS);
  writeFileSync(join(folder, "main.py"), PYTHON);

  // TS：命令面板里有“格式化文档”和快捷键，⌥⇧F 重排整份文件，自动保存写盘
  await page.getByRole("treeitem", { name: "App.ts", exact: true }).click();
  const editor = page.locator(".monaco-editor .view-lines").first();
  await expect(editor).toContainText("function add");
  await editor.click();
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("format");
  await expect(page.getByRole("option", { name: /Format document/ })).toContainText("⌥⇧F");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+Shift+F");
  await expect
    .poll(() => readFileSync(join(folder, "App.ts"), "utf8"), { timeout: 15_000 })
    .not.toBe(MESSY_TS);
  const formatted = readFileSync(join(folder, "App.ts"), "utf8");
  expect(formatted).toContain("function add(a: number, b: number)");
  expect(formatted.replace(/\s+/g, "")).toBe(MESSY_TS.replace(/\s+/g, "").replace(/;/g, ""));

  // Python：右键菜单里置灰并写明原因，命令面板没有这一项，快捷键不动文件
  await page.getByRole("treeitem", { name: "main.py", exact: true }).click();
  await expect(editor).toContainText("x");
  await editor.click({ button: "right" });
  const item = page.getByRole("menuitem", { name: /Format Document/ });
  await expect(item).toHaveText(/not available for Python/);
  await expect(item).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+Shift+P");
  await page.keyboard.type("format");
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+Shift+F");
  await page.keyboard.press("Meta+s");
  await expect.poll(() => readFileSync(join(folder, "main.py"), "utf8")).toBe(PYTHON);
});
