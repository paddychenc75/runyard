import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { expect, test } from "./support/fixtures.ts";
import { prepareQuickOpen } from "./support/quick-open-performance-fixture.ts";
import { armUiProbe, readUiProbe } from "./support/ui-performance-probe.ts";

const output = process.env.RUNYARD_PERF_OUTPUT;
if (!output || !process.env.RUNYARD_E2E_APP)
  throw new Error("请指定真实e2e包与独立RUNYARD_PERF_OUTPUT目录");

for (let sample = 1; sample <= 3; sample++) {
  test(`EDITOR-74 万文件快速打开 独立实例 ${sample}`, async ({ launch }) => {
    const instance = await launch();
    const { page } = instance;
    const generatedFiles = await prepareQuickOpen(instance);
    await armUiProbe(page, {
      key: "p",
      selector: '[role="listbox"] [role="option"]',
      needle: "style.css",
    });
    const dispatch = performance.now();
    await page.keyboard.press("Meta+p");
    const first = await readUiProbe(page);
    const firstUpperMs = performance.now() - dispatch;
    const filtering = [];
    for (const query of ["z", "ze", "zet", "zeta"]) {
      await armUiProbe(page, {
        key: query.at(-1) ?? "",
        selector: '[role="listbox"] [role="option"]',
        needle: `${query}0000.txt`,
        query,
        count: 100,
      });
      const began = performance.now();
      await page.keyboard.type(query.at(-1) ?? "");
      const measured = await readUiProbe(page);
      filtering.push({ query, ...measured, dispatchUpperMs: performance.now() - began });
    }
    const result = { sample, generatedFiles, first, firstUpperMs, filtering };
    writeFileSync(join(output, `quick-open-${sample}.json`), JSON.stringify(result, null, 2));
    console.log("QUICK_OPEN_PERFORMANCE", JSON.stringify(result));
    expect(first.paintedMs).toBeLessThanOrEqual(200);
    for (const entry of filtering) expect(entry.paintedMs).toBeLessThanOrEqual(100);
  });
}
