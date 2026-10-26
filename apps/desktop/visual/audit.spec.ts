import { auditScreen } from "./audit.ts";
import { expect, test } from "./fixtures.ts";
import { prepareScene } from "./prepare-scene.ts";
import { installResourceRoute } from "./resource-route.ts";
import { NOW } from "./scene-data.ts";

for (const fault of ["text", "overflow"] as const) {
  test(`故障注入证明画面检查会拒绝${fault}`, async ({ page, screenServer }) => {
    const errors: string[] = [];
    await installResourceRoute(page, screenServer, errors);
    await page.clock.setFixedTime(NOW);
    await page.goto(`${screenServer.url}?scene=Main&locale=en-XA`);
    await prepareScene(page, "Main", "en-XA");
    await auditScreen(page);
    await page.evaluate((kind) => {
      // 故意破坏本次测试DOM验证闸门；不截图、不写基准，也不改产品源码。
      const node = document.createElement("div");
      if (kind === "text") node.textContent = "Untranslated screen text";
      else {
        node.style.width = "10px";
        node.style.whiteSpace = "nowrap";
        node.textContent = "⟦Ŕéáļ óṽéŕƒļóŵ⟧";
      }
      document.body.append(node);
    }, fault);
    await expect(auditScreen(page)).rejects.toThrow(
      fault === "text" ? "未通过文案包" : "画面内容溢出",
    );
    expect(errors).toEqual([]);
  });
}
