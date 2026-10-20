import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "./support/fixtures.ts";
import { prepareQuickOpen } from "./support/quick-open-performance-fixture.ts";
import { armUiProbe, readUiProbe } from "./support/ui-performance-probe.ts";

const output = process.env.RUNYARD_PERF_OUTPUT;
if (!output || !process.env.RUNYARD_E2E_APP)
  throw new Error("请指定真实e2e包与独立RUNYARD_PERF_OUTPUT目录");

// #531：一次诊断而非达标测试。trace本身有开销，正常测量文件保留200/100ms断言。
test("EDITOR-74 首字100行帧调度诊断（trace，不判性能达标）", async ({ launch }) => {
  const instance = await launch();
  const { app, page } = instance;
  const generatedFiles = await prepareQuickOpen(instance);
  const main = await app.browserWindow(page);
  const windowState = () =>
    main.evaluate((window) => ({
      visible: window.isVisible(),
      focused: window.isFocused(),
      minimized: window.isMinimized(),
      bounds: window.getContentBounds(),
    }));
  const before = await windowState();
  const categories = await app.evaluate(({ contentTracing }) => contentTracing.getCategories());
  const start = performance.now();
  await app.evaluate(({ contentTracing }) =>
    contentTracing.startRecording({
      included_categories: [
        "toplevel",
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "blink",
        "blink.user_timing",
        "cc",
        "viz",
        "gpu",
        "electron",
      ],
      excluded_categories: ["*"],
      recording_mode: "record-until-full",
    }),
  );
  const traceStartMs = performance.now() - start;
  let traceFile: string;
  try {
    await armUiProbe(page, {
      key: "p",
      selector: '[role="listbox"] [role="option"]',
      needle: "style.css",
      traceLabel: "quick-open",
    });
    const opening = performance.now();
    await page.keyboard.press("Meta+p");
    const first = await readUiProbe(page);
    const openUpperMs = performance.now() - opening;
    await armUiProbe(page, {
      key: "z",
      selector: '[role="listbox"] [role="option"]',
      needle: "z0000.txt",
      query: "z",
      count: 100,
      traceLabel: "first-character",
    });
    const filtering = performance.now();
    await page.keyboard.type("z");
    const firstCharacter = await readUiProbe(page);
    const filterUpperMs = performance.now() - filtering;
    const result = {
      diagnosticOnly: true,
      generatedFiles,
      before,
      after: await windowState(),
      traceStartMs,
      categories,
      first,
      openUpperMs,
      firstCharacter,
      filterUpperMs,
    };
    writeFileSync(
      join(output, "quick-open-trace-observations.json"),
      JSON.stringify(result, null, 2),
    );
  } finally {
    traceFile = await app.evaluate(
      ({ contentTracing }, path) => contentTracing.stopRecording(path),
      join(output, "quick-open-chromium-trace.json"),
    );
  }
  console.log("QUICK_OPEN_TRACE", traceFile);
});
