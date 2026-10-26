import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect, type Page } from "@playwright/test";
import { desktopChannels } from "../src/shared/desktop-bridge.ts";
import type { LibraryState } from "../src/shared/library-state.ts";
import { libraryDesignFixture } from "./library-design-fixture.ts";
import { launchRunyard, type RunyardApp } from "./support/launch.ts";

// 手工与 CI 共用的画面取证工具，不属于端到端测试，不增加测试超时或重试。
// 产物默认落在独立临时目录；CI 用 RUNYARD_DESIGN_OUTPUT 指向 mktemp 创建的目录并上传。
const repo = resolve(import.meta.dirname, "..", "..", "..");
const output = process.env.RUNYARD_DESIGN_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-design-"));
mkdirSync(output, { recursive: true });
console.log(`本次取证目录：${output}`);
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const locales = ["zh-CN", "en"] as const;
const themes = ["light", "dark"] as const;
const boardName = (locale: string, theme: string, narrow: boolean) =>
  `${narrow ? "MainNarrow" : "Main"}${theme === "dark" ? "Dark" : ""}${locale === "en" ? "En" : ""}`;
const boards = locales.flatMap((locale) =>
  themes.flatMap((theme) => [false, true].map((narrow) => boardName(locale, theme, narrow))),
);
const realData = [join(homedir(), ".runyard"), join(homedir(), "Runyard")];
const modified = () => realData.map((path) => (existsSync(path) ? statSync(path).mtimeMs : null));
const before = modified();
const measurements: unknown[] = [];
const fixtureTime = Date.UTC(2026, 9, 19, 12);

async function pushFixture(instance: RunyardApp) {
  const base = await instance.call<LibraryState>("library.get");
  const state = libraryDesignFixture(base, instance.root, fixtureTime);
  await instance.page.evaluate(() => {
    (
      window as unknown as {
        runyard: {
          on: (event: string, cb: (value: { playgrounds: unknown[] }) => void) => unknown;
        };
      }
    ).runyard.on("library.changed", (value) => {
      document.documentElement.dataset.designRows = String(value.playgrounds.length);
    });
  });
  await instance.app.evaluate(
    ({ BrowserWindow }, [channel, fixture]) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window === undefined) throw new Error("没有找到本次启动的窗口");
      const send = window.webContents.send.bind(window.webContents);
      // 后台扫描可能继续推送真实的空资源库；整个取证期间固定画面数据，防止时序改变演示状态。
      window.webContents.send = (nextChannel, ...args) => {
        if (nextChannel === channel && args[0] === "library.changed")
          send(channel, "library.changed", fixture);
        else send(nextChannel, ...args);
      };
      send(channel, "library.changed", fixture);
    },
    [desktopChannels.event, state] as const,
  );
  await expect(instance.page.locator("html")).toHaveAttribute("data-design-rows", "9");
  await expect(instance.page.locator("tr[data-row-id]")).toHaveCount(9);
  await expect(
    instance.page.locator('tr[data-row-id="python-1"] [data-clean-tomorrow]'),
  ).toHaveCount(1);
}

async function captureApp(instance: RunyardApp, board: string, width: number, height: number) {
  await instance.app.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(w, h);
    },
    [width, height] as const,
  );
  // CI 的物理显示器可能把窗口高度限制在 679；固定网页视口，避免截短后拉伸成设计稿高度。
  await instance.page.setViewportSize({ width, height });
  const table = instance.page.getByRole("table");
  await expect.poll(() => instance.page.evaluate(() => innerWidth)).toBe(width);
  await expect.poll(() => instance.page.evaluate(() => innerHeight)).toBe(height);
  // 等可观察的收列状态，不用“睡一会儿应该好了”。
  if (width === 1100) {
    await expect(instance.page.locator('[data-collapsed~="template"]')).toBeVisible();
  }
  // 窄化会同时改变页头换行与表格收列；先等页头档位，避免鼠标坐标落到换行前的相邻行。
  await expect
    .poll(() =>
      instance.page
        .locator("input[aria-label]")
        .first()
        .evaluate((el) => el.closest("[data-size]")?.getAttribute("data-size")),
    )
    // 页头 ≥ 1124 才是宽工具条（LibraryPage 的 HEADER_WIDE_PX，UI 走查 L1 从 800 提到 1124）：
    // 只有 1440 放得下；1100、1024、900、720 都是收紧的“short”
    .toBe(width === 1440 ? "wide" : "short");
  const selected = instance.page.locator('tr[data-row-id="react19-1"]');
  await selected.locator('td[data-column="name"]').click();
  await expect(selected).toHaveAttribute("data-selected", "");
  await instance.page.locator('tr[data-row-id="go-channels"]').hover();
  await instance.page.evaluate(() => document.fonts.ready);
  const metrics = await table.evaluate((element) => ({
    viewport: innerWidth,
    viewportHeight: innerHeight,
    width: element.getBoundingClientRect().width,
    columns: [...element.querySelectorAll("thead th")].map((cell) => ({
      id: cell.getAttribute("data-column"),
      width: cell.getBoundingClientRect().width,
    })),
    clippedSizes: [...element.querySelectorAll('tbody td[data-column="size"]')].flatMap((cell) => {
      const box = cell.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(cell);
      const text = range.getBoundingClientRect();
      return text.left < box.left - 1 || text.right > box.right + 1 ? [cell.textContent] : [];
    }),
    horizontalOverflow:
      element.parentElement === null
        ? null
        : element.parentElement.scrollWidth - element.parentElement.clientWidth,
  }));
  expect(metrics.horizontalOverflow, `${board}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(metrics.columns.find((column) => column.id === "name")?.width).toBeGreaterThanOrEqual(200);
  for (const id of ["name", "status", "size", "retention", "actions"])
    expect(
      metrics.columns.some((column) => column.id === id),
      `${board}: ${id}`,
    ).toBe(true);
  expect(metrics.clippedSizes, `${board}: size text bounds`).toEqual([]);
  measurements.push({ board, metrics });
  await instance.page.screenshot({ path: join(output, `${board}-app.png`), scale: "css" });
  if (width === 720) {
    await instance.page
      .locator('tr[data-row-id="hono-1"] td[data-column="size"] [data-user-content]')
      .hover();
    await expect(instance.page.getByText(/node_modules/)).toBeVisible();
    await instance.page.screenshot({
      path: join(output, `${board}-dependencies.png`),
      scale: "css",
    });
  }
}

async function captureComparison(page: Page, board: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(pathToFileURL(join(repo, "tooling/design-render/build", `${board}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(output, `${board}-design.png`) });
  const appImage = readFileSync(join(output, `${board}-app.png`)).toString("base64");
  const designImage = readFileSync(join(output, `${board}-design.png`)).toString("base64");
  await page.setViewportSize({ width: width * 2, height: height + 40 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#eee;font:16px system-ui}.pair{display:flex}figure{margin:0;width:${width}px}
    figcaption{height:40px;display:flex;align-items:center;padding-left:16px;box-sizing:border-box}
    img{display:block;width:${width}px;height:${height}px}
    </style><div class="pair"><figure><figcaption>${board} · 设计稿</figcaption>
    <img src="data:image/png;base64,${designImage}"></figure><figure><figcaption>${board} · 应用（固定演示状态）</figcaption>
    <img src="data:image/png;base64,${appImage}"></figure></div>`);
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
    );
  await page.screenshot({ path: join(output, `${board}-comparison.png`) });
}

async function main() {
  for (const board of boards) {
    if (!existsSync(join(repo, "tooling/design-render/build", `${board}.html`))) {
      throw new Error(
        "请先用 node tooling/design-render/render.mjs Main MainDark MainEn MainDarkEn MainNarrow MainNarrowDark MainNarrowEn MainNarrowDarkEn --no-shots 展开设计稿",
      );
    }
  }
  const browser = await chromium.launch({ executablePath: chrome });
  try {
    const page = await browser.newPage();
    for (const locale of locales)
      for (const theme of themes) {
        const instance = await launchRunyard({ lang: locale, theme });
        instance.page.on("pageerror", (error) =>
          appendFileSync(join(output, "page-errors.log"), `${error.stack ?? error.message}\n`),
        );
        instance.page.on("console", (message) => {
          if (message.type() === "error")
            appendFileSync(join(output, "page-errors.log"), `${message.text()}\n`);
        });
        try {
          // 只固定 renderer 的 Date，定时器照常运行；重新加载让相对时间从同一时刻开始。
          await instance.page.clock.setFixedTime(fixtureTime);
          await instance.page.reload();
          const picker = instance.page.getByRole("dialog").getByRole("combobox");
          await expect(picker).toBeFocused();
          await picker.press("Escape");
          await expect(instance.page.getByRole("dialog")).toHaveCount(0);
          await pushFixture(instance);
          for (const narrow of [false, true]) {
            const board = boardName(locale, theme, narrow);
            const width = narrow ? 1100 : 1440;
            const height = narrow ? 800 : 900;
            await captureApp(instance, board, width, height);
            await captureComparison(page, board, width, height);
          }
          for (const width of [1024, 900, 720]) {
            await captureApp(instance, `Boundary${width}-${locale}-${theme}`, width, 800);
          }
        } catch (error) {
          await instance.page.screenshot({ path: join(output, `failure-${locale}-${theme}.png`) });
          writeFileSync(
            join(output, "failure-body.txt"),
            await instance.page.locator("body").innerText(),
          );
          throw error;
        } finally {
          await instance.shutdown();
        }
      }
  } finally {
    await browser.close();
    const after = modified();
    writeFileSync(
      join(output, "measurements.json"),
      JSON.stringify({ before, after, measurements }, null, 2),
    );
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      console.error("真实数据目录的修改时间变了，请停止并检查");
      process.exitCode = 1;
    }
  }
  writeFileSync(
    join(output, "README.md"),
    `# 资源库设计稿并排对照\n\n左：仓库设计稿；右：真实 Electron 应用，经过真实 IPC 事件注入固定演示状态。\n\n共八组：1440×900 / 1100×800，浅色 / 深色，中文 / 英文。九行覆盖两项运行中、崩溃、找不到文件夹、智能体和命令行徽标、空备注、自动清理、选中与悬停。截图仅验证界面，运行和磁盘行为另由端到端及单元测试验证。\n\n本次保留的范围差异：大小列已接入 #410（取证用固定大小状态覆盖计算中、不完整及GB值，真实磁盘更新另由library-size.e2e验证）；侧栏分组沿用 #448；窄窗口自动隐藏与压缩间距为负责人2026-10-19批准的方案A，另附720/900/1024中英浅深12图，三种宽度无横滚、名称至少200。侧栏切换按钮沿已合入#446的52高顶栏固定在x90/y12。完整差异及负责人批准出处在 PR 描述中记录。\n\n应用和设计稿提交：${process.env.GITHUB_SHA ?? process.env.RUNYARD_DESIGN_COMMIT ?? "本地工作树，提交编号由 PR 记录"}\n\n真实 ~/.runyard 与 ~/Runyard 目录的修改时间未变，详见 measurements.json。\n`,
  );
  console.log(`并排图已写入 ${output}`);
}

await main();
