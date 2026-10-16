import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// 截图比对的配置（技术设计 §6.7、§8.3 的 ui-visual）。
// 基准图只在 CI 的 macos-26 上生成：本地 pnpm ui:visual 只比对。两道闸：
// 1. updateSnapshots 默认 "none"：缺基准图也是失败，不会悄悄写一张新的（Playwright 默认是 "missing"）；
// 2. 想更新（环境变量 RUNYARD_UI_BASELINE=update 或命令行 -u / --update-snapshots）必须在 CI 里，
//    否则这个配置文件直接抛错，不同机器的字体渲染差一点点，混着生成会满屏误报。
const updateRequested =
  process.env.RUNYARD_UI_BASELINE === "update" ||
  process.argv.includes("--update-snapshots") ||
  process.argv.includes("-u");
if (updateRequested && !process.env.CI) {
  throw new Error(
    "基准图只在 CI 的 macos-26 上生成，本地不许更新：去掉 -u / --update-snapshots，或给 PR 加标签 update-ui-baseline 让 CI 更新（docs/guides/ui-visual.md）。",
  );
}

const output = join(import.meta.dirname, ".output");

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "*.spec.ts",
  outputDir: join(output, "test-results"),
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  updateSnapshots: updateRequested ? "all" : "none",
  // 每个样例文件一张整表图，几十个页面而已；一个工作进程，渲染结果最稳定（K15 实测是在串行下一致的）
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    [
      "./change-report-reporter.ts",
      { outputFile: join(output, "change-report", "ui-change-report.html") },
    ],
  ],
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      // 同一镜像逐像素一致（K15），留一点点抗锯齿余量；单个像素的颜色阈值用默认值
      maxDiffPixels: 20,
    },
  },
  use: {
    viewport: { width: 480, height: 800 },
    // 技术设计 §6.7：缩放档位用 1×；2× 的实测对比见 docs/guides/ui-visual.md
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  },
});
