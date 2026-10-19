import { combinations } from "../../../packages/ui/visual/matrix.ts";
import { auditScreen } from "./audit.ts";
import { expect, test } from "./fixtures.ts";
import { prepareScene } from "./prepare-scene.ts";
import { NOW } from "./scene-data.ts";
import { scenes } from "./scenes.ts";

for (const scene of scenes)
  for (const combination of combinations) {
    test(`${scene.id} / ${combination.theme} / ${combination.locale}`, async ({
      page,
      screenUrl,
    }, info) => {
      const errors: string[] = [];
      await page.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin === new URL(screenUrl).origin)
          await route.continue();
        else {
          errors.push(`画面工作台尝试访问外部地址：${route.request().url()}`);
          await route.abort();
        }
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: scene.width, height: 900 });
      await page.clock.setFixedTime(NOW);
      await page.emulateMedia({ colorScheme: combination.theme });
      await page.goto(
        `${screenUrl}?scene=${scene.id}&locale=${combination.locale}&theme=${combination.theme}`,
      );
      await prepareScene(page, scene.id, combination.locale);
      expect(errors, "画面存在未处理错误，契约替身可能不完整").toEqual([]);
      if (combination.locale === "en-XA") await auditScreen(page);
      await expect(page).toHaveScreenshot(
        `${scene.id}-${combination.theme}-${combination.locale}.png`,
      );
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => (window as unknown as { sceneDiagnostics: string[] }).sceneDiagnostics,
        ),
      ).toEqual([]);
      // 仅在扫描和基准比对都成功后记录执行覆盖，清单自身不等于证据。
      await info.attach("screen-coverage", {
        body: JSON.stringify({ scene: scene.id, boards: scene.boards, ...combination }),
        contentType: "application/json",
      });
    });
  }
