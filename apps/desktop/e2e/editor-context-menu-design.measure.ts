import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createWithKeyboard } from "./support/fixtures.ts";
import { launchRunyard } from "./support/launch.ts";

// 编辑器右键菜单取证截图（#566）：中英 × 浅深，菜单伸到右边预览区域；输出目录由 RUNYARD_CTXMENU_REVIEW_OUTPUT 指定。
// 原生预览是另一个视图，页面截图里看不到它，所以截图里预览区是空的：菜单打开时预览让位也是这个效果。
// 菜单里现成的文字项没有不可用的，截图前把“粘贴”标成不可用来看灰色效果（真正的不可用项见 #565 的“格式化文档”）。
const output =
  process.env.RUNYARD_CTXMENU_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-ctxmenu566-"));
mkdirSync(output, { recursive: true });

for (const lang of ["zh-CN", "en"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`右键菜单截图：${lang}-${theme}`, async () => {
      const instance = await launchRunyard({ lang, theme });
      try {
        const { page } = instance;
        await createWithKeyboard(page);
        await expect(page.getByRole("group", { name: /Run bar|运行条/ })).toContainText(/:\d+/);
        await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
        const editor = page.locator(".monaco-editor .view-lines").first();
        await expect(editor).toContainText("doctype");
        await editor.click({ button: "right", position: { x: 500, y: 200 } });
        await expect(page.getByRole("menuitem").first()).toBeVisible();
        await page.evaluate(() => {
          const root = document.querySelector(".shadow-root-host")?.shadowRoot;
          const items = [...(root?.querySelectorAll(".action-item:not(.disabled)") ?? [])];
          items
            .find((item) => /Paste|粘贴/.test(item.textContent ?? ""))
            ?.classList.add("disabled");
        });
        await page.screenshot({ path: join(output, `${lang}-${theme}-menu.png`) });
      } finally {
        await instance.shutdown();
      }
    });
  }
}
