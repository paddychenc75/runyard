import { closePicker, expect, test } from "./support/fixtures.ts";

// 顶栏方案 A 的真实窗口检查（规格 DESKTOP-LIBRARY-VIEW-61、65 至 67）：搜索框在页头、侧栏按钮在侧栏顶部、窗口变窄时收紧
test("[DESKTOP-WORKSPACE-68][DESKTOP-LIBRARY-VIEW-93] 版面：搜索在页头、侧栏按钮跟着红绿灯、1024 宽时页头收紧", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page, app } = runyard;
  // 选择器只在应用读到空资源库时弹出：先等它出现并关掉，再让命令行建项目，否则命令行抢先时选择器根本不会出现
  await closePicker(page);
  await runyard.cli("new", "html", "alpha");
  await runyard.cli("run", "alpha");
  const resize = (width: number, height: number) =>
    app.evaluate(
      ({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(size[0] ?? 1440, size[1] ?? 900);
      },
      [width, height],
    );
  await resize(1440, 900);

  // 搜索框在内容区的页头里，顶栏（标签条所在行）里没有
  const search = page.getByRole("textbox", { name: "Search playgrounds" });
  await expect(
    page.getByRole("main").getByRole("textbox", { name: "Search playgrounds" }),
  ).toBeVisible();
  const tabs = page.getByRole("tablist");
  const searchBox = await search.boundingBox();
  const tabsBox = await tabs.boundingBox();
  expect(searchBox?.y ?? 0).toBeGreaterThan((tabsBox?.y ?? 0) + (tabsBox?.height ?? 0));
  await expect(page.getByRole("button", { name: /^Type/ })).toBeVisible();

  // 侧栏按钮在侧栏里；收起后在顶栏最左边，标签条在它右边
  const hide = page.getByRole("button", { name: "Hide sidebar" });
  const hideBox = await hide.boundingBox();
  expect(hideBox?.x).toBe(90);
  expect(hideBox?.y).toBe(12);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getWindowButtonPosition(),
    ),
  ).toEqual({ x: 19, y: 19 });
  await hide.click();
  const show = page.getByRole("button", { name: "Show sidebar" });
  await expect(show).toBeVisible();
  const showBox = await show.boundingBox();
  const tabsAfter = await tabs.boundingBox();
  expect(showBox).toEqual(hideBox);
  expect(tabsAfter?.x).toBe(134);
  await show.click();

  // 1024 宽自动隐藏侧栏；UI 走查 L1 把宽工具条的门槛提到内容区 1180，所以 1024 已经合成“筛选”。
  await resize(1024, 720);
  await expect(page.getByRole("navigation", { name: "Library navigation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filter" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Type/ })).toHaveCount(0);
  await resize(720, 720);
  await expect(page.getByRole("button", { name: "Filter" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Type/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^1 running/ })).toHaveText("1 running");
  await resize(1440, 900);
  await expect(page.getByRole("button", { name: /^Type/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Library navigation" })).toBeVisible();
});
