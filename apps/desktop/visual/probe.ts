import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { collectPageTexts, findLeakedText } from "@runyard/i18n";
import { findOverflows } from "../../../packages/ui/visual/overflow-scan.ts";
import { serveScreens } from "./build.ts";
import { prepareScene } from "./prepare-scene.ts";
import { installResourceRoute } from "./resource-route.ts";
import { NOW } from "./scene-data.ts";
import { scenes } from "./scenes.ts";

if (process.argv[2] && !scenes.some((scene) => scene.id === process.argv[2]))
  throw new Error("未登记的画面，不能把空执行当作通过。");
const out = mkdtempSync(join(tmpdir(), "ry-screen400-"));
let failed = false;
const server = await serveScreens(join(out, "site"));
const browser = await chromium.launch({
  headless: true,
});
try {
  const reports: unknown[] = [];
  for (const scene of scenes.filter((item) => !process.argv[2] || item.id === process.argv[2])) {
    const page = await browser.newPage({
      viewport: { width: scene.width, height: 900 },
      reducedMotion: "reduce",
      timezoneId: "UTC",
      locale: "en-US",
    });
    const errors: string[] = [];
    await installResourceRoute(page, server, errors);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(NOW);
    try {
      await page.goto(`${server.url}?locale=en-XA&scene=${scene.id}`);
      await prepareScene(page, scene.id, "en-XA");
      const texts = await page.evaluate(`(${collectPageTexts.toString()})(document.body)`);
      const details = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("body *")]
          .filter(
            (node) =>
              node.clientWidth > 0 &&
              node.scrollWidth > node.clientWidth + 1 &&
              !node.hasAttribute("data-truncate"),
          )
          .map((node) => ({
            tag: node.tagName,
            class: node.className,
            text: node.textContent?.slice(0, 130),
          })),
      );
      const report = {
        scene: scene.id,
        errors,
        details,
        leaks: findLeakedText(texts as Parameters<typeof findLeakedText>[0]),
        overflows: await page.evaluate(`(${findOverflows.toString()})(document.body)`),
      };
      reports.push(report);
      if (errors.length || report.leaks.length || (report.overflows as unknown[]).length)
        failed = true;
      await page.screenshot({ path: join(out, `${scene.id}.png`), animations: "disabled" });
      console.log(JSON.stringify(report));
    } catch (error) {
      failed = true;
      const report = { scene: scene.id, errors, error: String(error) };
      reports.push(report);
      console.log(JSON.stringify(report));
    }
    await page.close();
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(reports, null, 2));
  console.log(out);
} finally {
  await browser.close();
  await server.stop();
}

if (failed) process.exitCode = 1;
