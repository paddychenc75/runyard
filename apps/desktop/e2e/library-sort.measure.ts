import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { closePicker } from "./support/fixtures.ts";
import { launchRunyard } from "./support/launch.ts";

// #575 评审截图：中英 × 浅深 × （悬停、降序、升序、键盘焦点）的表头，1440 宽。
// 输出目录用 RUNYARD_SORT575_OUT，没设就新建临时目录；不进 CI。
const out = process.env.RUNYARD_SORT575_OUT ?? mkdtempSync(join(tmpdir(), "runyard-sort575-"));
mkdirSync(out, { recursive: true });

for (const lang of ["zh-CN", "en"] as const) {
  for (const theme of ["light", "dark"] as const) {
    const runyard = await launchRunyard({ lang, theme });
    try {
      const { page, app } = runyard;
      await closePicker(page);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
      });
      for (const name of ["alpha", "beta", "gamma"]) await runyard.cli("new", "html", name);
      await expect(page.locator("tbody tr[data-row-id]")).toHaveCount(3);
      const shot = async (state: string) => {
        const head = await page.locator("thead").boundingBox();
        if (head === null) throw new Error("no thead");
        await page.screenshot({
          path: join(out, `${lang}-${theme}-${state}.png`),
          clip: { x: head.x, y: head.y - 8, width: head.width, height: head.height + 110 },
        });
      };
      const name = page.locator('th[data-column="name"] button');
      const recent = page.locator('th[data-column="lastUsed"] button');
      await name.hover();
      await shot("hover");
      await page.mouse.move(0, 0);
      await shot("sorted-desc");
      await recent.click();
      await page.mouse.move(0, 0);
      await shot("sorted-asc");
      await page.keyboard.press("Tab");
      await name.focus();
      await shot("keyboard-focus");
    } finally {
      await runyard.quit();
    }
  }
}
console.log(out);
