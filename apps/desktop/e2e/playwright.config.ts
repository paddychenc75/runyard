import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// 端到端测试（#180）：用 Playwright 驱动真正的 Electron 应用，每个用例自己起一份应用（临时主目录加临时资源库）。
// 一个工作进程：应用是单实例，用例之间也不共享状态；失败不重试，偶发失败要记成 flaky issue 而不是被重试盖住。
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "*.e2e.ts",
  outputDir: join(import.meta.dirname, ".output", "test-results"),
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  // 单个用例 90 秒：最慢的是 React 模板第一次装依赖，其余几秒内完成
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
});
