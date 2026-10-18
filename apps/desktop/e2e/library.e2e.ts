import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Locator } from "@playwright/test";
import { closePicker, expect, test } from "./support/fixtures.ts";

test("资源库：搜索与筛选、重命名、改备注、移到废纸篓", async ({ launch }) => {
  const runyard = await launch();
  const { page, app } = runyard;
  // 选择器只在应用读到空资源库时弹出：先等它出现并关掉，再让命令行建项目，否则命令行抢先时选择器根本不会出现
  await closePicker(page);
  // 页头在窄窗口里会把“类型”“状态”合成“筛选”：CI 的屏幕小，窗口会被压窄，先固定成宽窗口
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
  });
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("new", "python", "beta");
  await runyard.cli("run", "alpha");
  const rows = page.getByRole("table", { name: "Playgrounds" }).getByRole("row");
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(1);

  // 搜索：按名称，清空后恢复
  const search = page.getByRole("textbox", { name: "Search playgrounds" });
  await search.fill("bet");
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(1);
  await expect(page.getByText("1 result")).toBeVisible();
  await search.fill("");
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(1);

  // 状态筛选：只看运行中的，再换回全部
  await page.getByRole("button", { name: /^Status/ }).click();
  await page.getByRole("menuitemradio", { name: "Running" }).click();
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "alpha" })).toHaveCount(1);
  await page.getByRole("button", { name: /^Status/ }).click();
  await page.getByRole("menuitemradio", { name: "All" }).click();
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(1);

  // 重命名：行内编辑，文件夹跟着改名
  await page.getByRole("button", { name: "More actions for alpha" }).click();
  await page.getByRole("menuitem", { name: /^Rename/ }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("alpha-renamed");
  await page.keyboard.press("Enter");
  await expect(rows.filter({ hasText: "alpha-renamed" })).toHaveCount(1);
  expect(existsSync(join(runyard.library, "alpha-renamed"))).toBe(true);
  expect(existsSync(join(runyard.library, "alpha"))).toBe(false);

  // 改备注，并且能按备注搜到
  await page.getByRole("button", { name: "More actions for alpha-renamed" }).click();
  await page.getByRole("menuitem", { name: /^Edit note/ }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("remember-this-note");
  await page.keyboard.press("Enter");
  await expect(rows.filter({ hasText: "remember-this-note" })).toHaveCount(1);
  await search.fill("remember-this");
  await expect(rows.filter({ hasText: "alpha-renamed" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "beta" })).toHaveCount(0);
  await search.fill("");

  // 移到废纸篓：先确认；平台的废纸篓在临时主目录里，文件夹从资源库消失、出现在废纸篓
  await page.getByRole("button", { name: "More actions for alpha-renamed" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await page
    .getByRole("alertdialog", { name: /Move alpha-renamed to the Trash/ })
    .getByRole("button", { name: "Move to Trash" })
    .click();
  await expect(rows.filter({ hasText: "alpha-renamed" })).toHaveCount(0);
  expect(existsSync(join(runyard.library, "alpha-renamed"))).toBe(false);
  const trash = join(runyard.root, ".Trash");
  expect(readdirSync(trash).some((name) => name.startsWith("alpha-renamed"))).toBe(true);
});

test("资源库表格：每个宽度下表头和每一行逐列对齐，没有横向滚动，没有列被截断（#348）", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page, app } = runyard;
  // 选择器只在应用读到空资源库时弹出：先等它出现并关掉，再让命令行建项目，否则命令行抢先时选择器根本不会出现
  await closePicker(page);
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("new", "python", "beta");
  const table = page.getByRole("table", { name: "Playgrounds" });
  await expect(table.getByRole("row").filter({ hasText: "alpha" })).toHaveCount(1);

  for (const width of [1600, 1200, 900]) {
    await app.evaluate(
      ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 800),
      width,
    );
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(width);
    const boxes = async (cells: Locator): Promise<{ left: number; width: number }[]> => {
      const out: { left: number; width: number }[] = [];
      for (const cell of await cells.all()) {
        const box = await cell.boundingBox();
        out.push({ left: Math.round(box?.x ?? -1), width: Math.round(box?.width ?? -1) });
      }
      return out;
    };
    // 收列是放不下时才发生的：等表头的列数稳定后再逐列比
    await expect
      .poll(async () => (await boxes(table.getByRole("columnheader"))).length)
      .toBeGreaterThanOrEqual(5);
    const header = await boxes(table.getByRole("columnheader"));
    const firstRow = await boxes(table.getByRole("row").nth(1).getByRole("cell"));
    expect(firstRow).toEqual(header);
    const scrolls = await page.evaluate(() => {
      const tableEl = document.querySelector("table[aria-label='Playgrounds']");
      let scroller: Element | null = tableEl?.parentElement ?? null;
      while (scroller !== null && getComputedStyle(scroller).overflowX === "visible")
        scroller = scroller.parentElement;
      return scroller !== null && scroller.scrollWidth > scroller.clientWidth + 1;
    });
    expect(scrolls, `${width} 宽`).toBe(false);
  }
});

type Box = { left: number; right: number; width: number };

test("[DESKTOP-LIBRARY-VIEW-28][DESKTOP-LIBRARY-VIEW-29] 窗口 1100 宽：收起“最近使用”和端口、模板只剩徽标，没有横向滚动，运行中的行在状态后写端口；拉宽到 1440 后全部恢复", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page, app } = runyard;
  await closePicker(page);
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("new", "python", "beta");
  await runyard.cli("run", "alpha");
  const table = page.getByRole("table", { name: "Playgrounds" });
  await expect(table.getByRole("row").filter({ hasText: "alpha" })).toHaveCount(1);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1100, 800));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(1100);

  // 一次取出：滚动区有没有横向滚动、表头的字、每格有没有被截断、运行中的行的状态格写了什么
  const measure = () =>
    page.evaluate(() => {
      const tableEl = document.querySelector("table[aria-label='Playgrounds']");
      if (tableEl === null) throw new Error("no table");
      let scroller: Element | null = tableEl.parentElement;
      while (scroller !== null && getComputedStyle(scroller).overflowX === "visible")
        scroller = scroller.parentElement;
      const shown = (el: Element) => (el as HTMLElement).offsetParent !== null;
      const status = [...tableEl.querySelectorAll("tbody tr")]
        .find((r) => r.textContent?.includes("alpha"))
        ?.querySelector("td[data-column='status']");
      const stopped = [...tableEl.querySelectorAll("tbody tr")]
        .find((r) => r.textContent?.includes("beta"))
        ?.querySelector("td[data-column='status']");
      const box = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      return {
        scrolls: scroller !== null && scroller.scrollWidth > scroller.clientWidth + 1,
        headers: [...tableEl.querySelectorAll("th")].map((th) => ({
          text: th.textContent ?? "",
          column: th.getAttribute("data-column") ?? "",
          ...box(th),
        })),
        clipped: [...tableEl.querySelectorAll("th, td[data-column]")]
          .filter((cell) => cell.scrollWidth > cell.clientWidth + 1)
          .map((cell) => cell.getAttribute("data-column") ?? cell.textContent),
        runningStatus:
          status === undefined || status === null ? null : (status as HTMLElement).innerText,
        stoppedStatus:
          stopped === undefined || stopped === null ? null : (stopped as HTMLElement).innerText,
        portHidden: [...tableEl.querySelectorAll("[data-when-collapsed]")].every(
          (el) => !shown(el),
        ),
      };
    });

  await expect.poll(async () => (await measure()).headers.length).toBe(5);
  const narrow = await measure();
  expect(narrow.scrolls).toBe(false);
  expect(narrow.headers.map((h) => h.column)).toEqual([
    "name",
    "status",
    "template",
    "retention",
    "actions",
  ]);
  expect(narrow.headers.filter((h) => h.column !== "actions").map((h) => h.text)).toEqual([
    "Name and note",
    "Status",
    "Template",
    "Auto-clean",
  ]);
  expect(narrow.clipped).toEqual([]);
  // 运行中的行：“Running :71xx”；已停止的只写状态
  expect(narrow.runningStatus).toMatch(/^Running\s+:\d+$/);
  expect(narrow.stoppedStatus?.trim()).toBe("Stopped");
  // 表头每列都完整落在表里
  for (const header of narrow.headers as Box[]) expect(header.width).toBeGreaterThan(0);

  // 拉宽：端口和最近使用回到自己的列，状态里不再写端口
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 800));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(1440);
  await expect.poll(async () => (await measure()).headers.length).toBe(7);
  const wide = await measure();
  expect(wide.scrolls).toBe(false);
  expect(wide.headers.filter((h) => h.column !== "actions").map((h) => h.text)).toEqual([
    "Name and note",
    "Status",
    "Template",
    "Port",
    "Last used",
    "Auto-clean",
  ]);
  expect(wide.clipped).toEqual([]);
  expect(wide.runningStatus?.trim()).toBe("Running");
});

test("[#299] 主题蓝：浅色和深色下主按钮的渲染色都是设计稿的 #0071E3", async ({ launch }) => {
  for (const theme of ["light", "dark"] as const) {
    const runyard = await launch({ theme });
    await closePicker(runyard.page);
    const color = await runyard.page
      .getByRole("button", { name: "New", exact: true })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(color, theme).toBe("rgb(0, 113, 227)");
    await runyard.shutdown();
  }
});

test("资源库：窗口矮时最后一行的更多菜单不被截断，最后一项可见可点（#405）", async ({ launch }) => {
  const runyard = await launch();
  const { page, app } = runyard;
  await closePicker(page);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
  });
  for (const name of ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]) {
    await runyard.cli("new", "html", name);
  }
  const rows = page.getByRole("table", { name: "Playgrounds" }).getByRole("row");
  await expect(rows.filter({ hasText: "m8" })).toHaveCount(1);
  // 最后一行（按名称排在最下面的那个）打开菜单：菜单要翻到上方或压低高度，不能伸出窗口
  const lastName = (await rows.last().innerText()).split("\n")[0]?.trim() ?? "";
  await page.getByRole("button", { name: `More actions for ${lastName}` }).click();
  const menu = page.getByRole("menu");
  const trash = menu.getByRole("menuitem", { name: "Move to Trash" });
  await trash.scrollIntoViewIfNeeded();
  // Electron 的页面没有固定视口，用窗口内容高度
  const viewport = { height: await page.evaluate(() => window.innerHeight) };
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
  const itemBox = await trash.boundingBox();
  expect((itemBox?.y ?? 0) + (itemBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
  await expect(trash).toBeVisible();
  await trash.click({ trial: true });
});
