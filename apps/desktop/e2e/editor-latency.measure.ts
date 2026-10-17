import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures.ts";

// 量“回车创建”到“编辑器显示入口文件”的时间（规格 DESKTOP-EDITOR-04，perf issue #266）。
// 不进 CI：文件名不是 *.e2e.ts。跑法见 docs/architecture/evidence/editor-150ms.md。
// 计时全在界面页面里用同一个时钟（performance.now）：起点是新建弹窗名称框上回车的 keydown，
// 终点是编辑器里出现入口文件的文字之后再过两帧（等于画出来了）。
//   RUNYARD_E2E_APP=<打好的包的可执行文件> RUNYARD_PERF_OUT=<结果 JSON 路径> RUNYARD_PERF_RUNS=10
//   pnpm --filter @runyard/desktop exec playwright test --config e2e/playwright.measure.config.ts

const RUNS = Number(process.env.RUNYARD_PERF_RUNS ?? "10");
const OUT = process.env.RUNYARD_PERF_OUT;
const ENTRY_TEXT = "Edit index.html, style.css or script.js";

interface Sample {
  mode: "cold" | "warm";
  /** 回车到入口文件文字进入 DOM（毫秒） */
  matched: number;
  /** 回车到入口文件画出来（两帧之后，毫秒） */
  painted: number;
  /** 各阶段第一次出现的时间：标签、文件树、编辑器外壳、第一行文字（毫秒） */
  phases: Record<string, number>;
  /** 按回车时编辑器运行时是否已加载完 */
  runtimeReadyAtEnter: boolean;
  /** 按回车时距应用启动页面多久（毫秒） */
  sinceLoad: number;
}

const samples: Sample[] = [];

async function arm(page: Page): Promise<void> {
  await page.evaluate((needle) => {
    const w = window as unknown as Record<string, unknown>;
    w.__perf = new Promise((resolve) => {
      let t0 = -1;
      window.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter" && t0 < 0) t0 = performance.now();
        },
        { capture: true, once: true },
      );
      const phases: Record<string, number> = {};
      // 主线程上超过 50 ms 的长任务：起点和时长，用来判断是不是脚本加载把界面堵住了
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          phases[`long@${Math.round(entry.startTime)}`] = entry.duration;
      }).observe({ type: "longtask", buffered: true });
      const mark = (name: string, seen: boolean): void => {
        if (t0 >= 0 && seen && phases[name] === undefined) phases[name] = performance.now() - t0;
      };
      const observer = new MutationObserver(() => {
        mark(
          "tab",
          document
            .querySelector('[role="tab"][aria-selected="true"]')
            ?.textContent?.includes("html") === true,
        );
        mark("tree", document.querySelector('[role="treeitem"]') !== null);
        mark("monaco", document.querySelector(".monaco-editor") !== null);
        mark("lines", document.querySelector(".monaco-editor .view-line") !== null);
        // Monaco 把空格画成不换行空格
        const text = (
          document.querySelector(".monaco-editor .view-lines")?.textContent ?? ""
        ).replaceAll("\u00a0", " ");
        if (t0 < 0 || !text.includes(needle)) return;
        const matched = performance.now() - t0;
        observer.disconnect();
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({ matched, painted: performance.now() - t0, phases }),
          ),
        );
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }, ENTRY_TEXT);
}

async function runtimeReady(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const pending = (window as unknown as Record<string, Promise<unknown> | undefined>)
      .__runyardEditorRuntime;
    if (pending === undefined) return false;
    return (await Promise.race([
      pending.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 30)),
    ])) as boolean;
  });
}

for (const mode of ["cold", "warm"] as const) {
  for (let run = 1; run <= RUNS; run++) {
    test(`${mode} ${run}`, async ({ launch }) => {
      const { page } = await launch();
      await expect(page.getByRole("combobox", { name: "Search templates" })).toBeFocused();
      if (mode === "warm") {
        // 预加载在空闲时做：等运行时就绪，再多等 2 秒让空闲任务收尾
        await expect.poll(() => runtimeReady(page), { timeout: 30_000 }).toBe(true);
        await page.waitForTimeout(2000);
      }
      await page.keyboard.press("Enter");
      await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
      const ready = await runtimeReady(page);
      const sinceLoad = await page.evaluate(() => performance.now());
      await arm(page);
      await page.keyboard.press("Enter");
      const result = (await page.evaluate(
        () => (window as unknown as { __perf: Promise<unknown> }).__perf,
      )) as { matched: number; painted: number; phases: Record<string, number> };
      samples.push({ mode, ...result, runtimeReadyAtEnter: ready, sinceLoad });
    });
  }
}

test.afterAll(() => {
  if (OUT !== undefined) writeFileSync(OUT, JSON.stringify(samples, null, 2));
});
