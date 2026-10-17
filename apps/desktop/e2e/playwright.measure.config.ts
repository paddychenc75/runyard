import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// 编辑器显示耗时的实测（不进 CI）：只跑 *.measure.ts，其余与 playwright.config.ts 一致
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "*.measure.ts",
  outputDir: join(import.meta.dirname, ".output", "test-results"),
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
});
