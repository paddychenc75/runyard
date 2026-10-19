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

test("资源库表格：窗口放得下和放不下时，表头与每一行逐列的 x 位置和宽度一致（#348）", async ({
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
    const header = await boxes(table.getByRole("columnheader"));
    const firstRow = await boxes(table.getByRole("row").nth(1).getByRole("cell"));
    expect(header.length).toBe(9);
    expect(firstRow.slice(0, 9)).toEqual(header);
  }
});

type Box = { left: number; right: number; width: number };

test("[DESKTOP-LIBRARY-VIEW-28][DESKTOP-LIBRARY-VIEW-29] 窗口 1100 宽：横向滚动时名称列和操作列不动，表头与每格逐列对齐，没有被截断的列，状态圆点留在名称列里", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page, app } = runyard;
  // 选择器只在应用读到空资源库时弹出：先等它出现并关掉，再让命令行建项目，否则命令行抢先时选择器根本不会出现
  await closePicker(page);
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("new", "python", "beta");
  await runyard.cli("run", "alpha");
  const table = page.getByRole("table", { name: "Playgrounds" });
  await expect(table.getByRole("row").filter({ hasText: "alpha" })).toHaveCount(1);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1100, 800));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(1100);

  // 一次取出：滚动区的可见范围、表头和第一行各格的位置、每个格子内容有没有被截断
  const measure = () =>
    page.evaluate(() => {
      const tableEl = document.querySelector("table[aria-label='Playgrounds']");
      if (tableEl === null) throw new Error("no table");
      let scroller: Element | null = tableEl.parentElement;
      while (scroller !== null && getComputedStyle(scroller).overflowX === "visible")
        scroller = scroller.parentElement;
      if (scroller === null) throw new Error("no scroller");
      const box = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      const view = box(scroller);
      const row = tableEl.querySelector("tbody tr:has(td[data-column='name'])");
      const running = [...tableEl.querySelectorAll("tbody tr")].find((r) =>
        r.textContent?.includes("alpha"),
      );
      if (row === null || running === undefined) throw new Error("no rows");
      const dot = running.querySelector("td[data-column='name'] [data-when-overflowing]");
      const nameCell = running.querySelector("td[data-column='name']");
      return {
        overflowing: scroller.scrollWidth > scroller.clientWidth + 1,
        maxScroll: scroller.scrollWidth - scroller.clientWidth,
        view,
        headers: [...tableEl.querySelectorAll("th")].map((th) => ({
          text: th.textContent ?? "",
          ...box(th),
        })),
        cells: [...row.querySelectorAll("td")].map((td) => box(td)),
        clipped: [...tableEl.querySelectorAll("th, td[data-column]")]
          .filter((cell) => cell.scrollWidth > cell.clientWidth + 1)
          .map((cell) => cell.getAttribute("data-column") ?? cell.textContent),
        dot: dot === null || nameCell === null ? null : { dot: box(dot), name: box(nameCell) },
      };
    });
  const scrollTo = (x: number) =>
    page.evaluate((left) => {
      const tableEl = document.querySelector("table[aria-label='Playgrounds']");
      let scroller: Element | null = tableEl?.parentElement ?? null;
      while (scroller !== null && getComputedStyle(scroller).overflowX === "visible")
        scroller = scroller.parentElement;
      scroller?.scrollTo({ left });
    }, x);
  const round = (b: Box) => ({ left: Math.round(b.left), width: Math.round(b.width) });

  const start = await measure();
  expect(start.overflowing).toBe(true);
  expect(start.clipped).toEqual([]);
  const nameStart = round(start.headers[0] as Box);
  const actionsStart = round(start.headers[8] as Box);

  for (const fraction of [0.5, 1]) {
    await scrollTo(Math.floor(start.maxScroll * fraction));
    await expect
      .poll(async () => Math.round((await measure()).headers[3]?.left ?? 0))
      .not.toBe(Math.round(start.headers[3]?.left ?? 0));
    const now = await measure();
    // 表头和第一行逐列对齐
    expect(now.cells.map(round)).toEqual(now.headers.map(round));
    // 名称列和操作列不随滚动移动
    expect(round(now.headers[0] as Box)).toEqual(nameStart);
    expect(round(now.headers[8] as Box)).toEqual(actionsStart);
    // 状态圆点在名称列里看得见
    expect(now.dot).not.toBeNull();
    expect(now.dot?.dot.width).toBeGreaterThan(0);
    expect(now.dot?.dot.left).toBeGreaterThanOrEqual(now.dot?.name.left ?? Infinity);
    expect(now.dot?.dot.right).toBeLessThanOrEqual(now.dot?.name.right ?? 0);
  }

  // 横向滚动能把“保留”“上次打开”“大小”“创建者”每一列完整地看到（落在两根固定列之间）：
  // 列多了之后它们不再同时放得下，所以逐个看，滚动过程中每一列至少有一次完整出现
  const wanted = ["Retention", "Last opened", "Size", "Created by"];
  const seen = new Set<string>();
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    await scrollTo(Math.floor(start.maxScroll * fraction));
    await expect
      .poll(async () => Math.round((await measure()).headers[3]?.left ?? 0))
      .toBe(Math.round((await measure()).headers[3]?.left ?? 0));
    const now = await measure();
    const nameRight = (now.headers[0] as Box).right;
    const actionsLeft = (now.headers[8] as Box).left;
    for (const text of wanted) {
      const header = now.headers.find((h) => h.text === text);
      expect(header, text).toBeDefined();
      if (header !== undefined && header.left >= nameRight - 1 && header.right <= actionsLeft + 1)
        seen.add(text);
    }
  }
  expect([...seen].sort()).toEqual([...wanted].sort());
  const end = await measure();
  expect(end.clipped).toEqual([]);

  // 缩窄之后放回 1440 宽：横向滚动条要消失，列宽回到一开始就是 1440 宽的样子（#404）
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 800));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(1440);
  await expect.poll(async () => (await measure()).overflowing).toBe(false);
  const wide = await measure();
  expect(wide.maxScroll).toBeLessThanOrEqual(1);
  expect(wide.clipped).toEqual([]);
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
