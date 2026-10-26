import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createWithKeyboard } from "./support/fixtures.ts";
import { launchRunyard } from "./support/launch.ts";

// “格式化文档”入口的取证截图（#562）：中英 × 浅深，右键菜单（可用、不可用）和命令面板各一张。
// 设计稿里没有这几个入口，只能对照已有的菜单、命令面板样式；输出目录由 RUNYARD_FORMAT_REVIEW_OUTPUT 指定。
const output =
  process.env.RUNYARD_FORMAT_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-format562-"));
mkdirSync(output, { recursive: true });

for (const lang of ["zh-CN", "en"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`格式化文档入口截图：${lang}-${theme}`, async () => {
      const instance = await launchRunyard({ lang, theme });
      try {
        const { page } = instance;
        await createWithKeyboard(page);
        await expect(page.getByRole("group", { name: /Run bar|运行条/ })).toContainText(/:\d+/);
        const folder = join(instance.library, "html-1");
        writeFileSync(join(folder, "App.ts"), "function add( a:number,b:number ){return a+b}\n");
        writeFileSync(join(folder, "main.py"), "x   =   1\n");
        const editor = page.locator(".monaco-editor .view-lines").first();
        const name = `${lang}-${theme}`;

        await page.getByRole("treeitem", { name: "App.ts", exact: true }).click();
        await expect(editor).toContainText("function add");
        await editor.click({ button: "right" });
        const menu = page.getByRole("menu");
        await expect(
          menu.getByRole("menuitem", { name: /^(格式化文档|Format Document)/ }),
        ).toBeVisible();
        await page.screenshot({ path: join(output, `${name}-menu-ts.png`) });
        await page.keyboard.press("Escape");

        await editor.click();
        await page.keyboard.press("Meta+Shift+P");
        await page.keyboard.type(lang === "en" ? "format" : "格式化");
        await expect(page.getByRole("option")).toHaveCount(1);
        await page.screenshot({ path: join(output, `${name}-palette-ts.png`) });
        await page.keyboard.press("Escape");

        await page.getByRole("treeitem", { name: "main.py", exact: true }).click();
        await expect(editor).toContainText("x");
        await editor.click({ button: "right" });
        const item = menu.getByRole("menuitem", { name: /^(格式化文档|Format Document)/ });
        await expect(item).toHaveAttribute("aria-disabled", "true");
        await page.screenshot({ path: join(output, `${name}-menu-py-disabled.png`) });
        await page.keyboard.press("Escape");
      } finally {
        await instance.shutdown();
      }
    });
  }
}
