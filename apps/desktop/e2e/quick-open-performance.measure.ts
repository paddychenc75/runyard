import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { closePicker, expect, test } from "./support/fixtures.ts";
import { armUiProbe, readUiProbe } from "./support/ui-performance-probe.ts";

const output = process.env.RUNYARD_PERF_OUTPUT;
if (!output || !process.env.RUNYARD_E2E_APP)
  throw new Error("请指定真实e2e包与独立RUNYARD_PERF_OUTPUT目录");

for (let sample = 1; sample <= 3; sample++) {
  test(`EDITOR-74 万文件快速打开 独立实例 ${sample}`, async ({ launch }) => {
    const instance = await launch();
    const { page } = instance;
    await closePicker(page);
    await instance.cli("new", "html", "large-project");
    const directory = join(instance.library, "large-project", "files");
    mkdirSync(directory);
    for (const prefix of ["z", "ze", "zet", "zeta"]) {
      for (let index = 0; index < 2500; index++) {
        writeFileSync(
          join(directory, `${prefix}${String(index).padStart(4, "0")}.txt`),
          `${prefix}:${index}\n`,
        );
      }
    }
    const generatedFiles = readdirSync(directory).length;
    expect(generatedFiles).toBe(10000);
    const state = () =>
      instance.call<{ playgrounds: { id: string; name: string }[] }>("library.get");
    await expect.poll(async () => (await state()).playgrounds.length).toBe(1);
    await instance.call("tab.openWithoutRun", (await state()).playgrounds[0]?.id);
    // 建立真实最近文件列表；不提前打开快速打开，也不额外请求/预热files.listAll。
    await page.getByRole("treeitem", { name: "style.css", exact: true }).click();
    await expect(page.getByRole("tab", { name: "style.css", exact: true })).toBeVisible();
    await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
    await page.locator(".monaco-editor .view-lines").first().click();
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
