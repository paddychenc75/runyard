import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const updating =
  process.env.RUNYARD_SCREEN_BASELINE === "update" ||
  process.argv.includes("-u") ||
  process.argv.some((arg) => arg.startsWith("--update-snapshots"));
if (updating && (!process.env.CI || process.env.RUNNER_OS !== "macOS"))
  throw new Error("画面基准只允许由macOS CI生成，本地只可比对或扫描。");
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "*.spec.ts",
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: join(import.meta.dirname, ".output", "test-results"),
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  updateSnapshots: updating ? "changed" : "none",
  reporter: [
    ["list"],
    ["json", { outputFile: join(import.meta.dirname, ".output", "results.json") }],
  ],
  expect: { toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 20 } },
  use: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  },
});
