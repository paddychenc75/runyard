import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "./support/fixtures.ts";
import { prepareQuickOpen } from "./support/quick-open-performance-fixture.ts";
import { armUiProbe, readUiProbe, type UiSample } from "./support/ui-performance-probe.ts";

const output = process.env.RUNYARD_PERF_OUTPUT;
if (!output || !process.env.RUNYARD_E2E_APP)
  throw new Error("请指定真实e2e包与独立RUNYARD_PERF_OUTPUT目录");
// #531：提前固定五个新实例，每实例一次首字与十次等长查询；不按结果加样本或提前停。
const queries = ["z", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const expectedNames = [
  "z0000",
  "z1000",
  "z2000",
  "z0300",
  "z0400",
  "z0500",
  "z0600",
  "z0700",
  "z0800",
  "z0900",
  "z0000",
];

for (let sample = 1; sample <= 5; sample++) {
  test(`EDITOR-74 固定分布诊断 实例${sample}（不以超标提前停止）`, async ({ launch }) => {
    const instance = await launch();
    const { page } = instance;
    const generatedFiles = await prepareQuickOpen(instance);
    const rows: {
      query: string;
      phase: string;
      ui: UiSample;
      dispatchUpperMs: number;
      within100ms: boolean;
    }[] = [];
    const record: Record<string, unknown> = {
      diagnosticOnly: true,
      sample,
      generatedFiles,
      queryPlan: queries,
      rows,
    };
    const save = () =>
      writeFileSync(join(output, `distribution-${sample}.json`), JSON.stringify(record, null, 2));
    try {
      await armUiProbe(page, {
        key: "p",
        selector: '[role="listbox"] [role="option"]',
        needle: "style.css",
      });
      const began = performance.now();
      await page.keyboard.press("Meta+p");
      const first = await readUiProbe(page);
      record.open = {
        ...first,
        dispatchUpperMs: performance.now() - began,
        within200ms: first.paintedMs <= 200,
      };
      let previous = first.observed;
      save();
      for (const [index, query] of queries.entries()) {
        if (index > 0) await page.keyboard.press("Meta+a");
        await armUiProbe(page, {
          key: query,
          selector: '[role="listbox"] [role="option"]',
          needle: `${expectedNames[index]}.txt`,
          query,
          count: 100,
          priorObserved: previous,
        });
        const dispatch = performance.now();
        await page.keyboard.type(query);
        const ui = await readUiProbe(page);
        rows.push({
          query,
          phase: index === 0 ? "first-character" : "same-length-warm",
          ui,
          dispatchUpperMs: performance.now() - dispatch,
          within100ms: ui.paintedMs <= 100,
        });
        previous = ui.observed;
        save();
      }
    } catch (error) {
      record.incomplete = String(error);
      save();
      throw error;
    }
    console.log(
      "QUICK_OPEN_DISTRIBUTION",
      JSON.stringify({
        sample,
        completed: rows.length,
        over100ms: rows
          .filter((row) => !row.within100ms)
          .map((row) => ({ query: row.query, ms: row.ui.paintedMs })),
      }),
    );
  });
}
