import { closePicker, expect, test } from "./support/fixtures.ts";

test("[DESKTOP-NOTIFICATIONS-01] [DESKTOP-NOTIFICATIONS-04] [DESKTOP-NOTIFICATIONS-05] 待处理通知恢复、关闭和列表保留", async ({
  launch,
}) => {
  const runyard = await launch({ lang: "en" });
  await closePicker(runyard.page);
  await runyard.page.evaluate(() =>
    localStorage.setItem(
      "runyard.notifications.v1",
      JSON.stringify([
        {
          id: "update",
          at: Date.now(),
          required: true,
          tone: "accent",
          icon: "info",
          title: { key: "desktop.window.title" },
        },
        {
          id: "clean",
          at: Date.now(),
          required: true,
          tone: "warning",
          icon: "warning",
          title: { key: "desktop.create.title" },
        },
        {
          id: "agent",
          at: Date.now() - 3600000,
          required: false,
          tone: "violet",
          icon: "spark",
          title: { key: "desktop.window.title" },
        },
      ]),
    ),
  );
  await runyard.page.reload();
  await closePicker(runyard.page);
  const cards = runyard.page.locator("[data-notification-cards]");
  await expect(cards.getByRole("status")).toHaveCount(2);
  const bell = runyard.page.getByRole("button", { name: "Notifications" });
  await expect(bell).toHaveAttribute("data-count", "2");
  await cards.getByRole("button").first().click();
  await expect(cards.getByRole("status")).toHaveCount(1);
  await expect(bell).toHaveAttribute("data-count", "2");
  await bell.click();
  const list = runyard.page.getByRole("dialog");
  await expect(list.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Recent" })).toBeVisible();
  await list.getByRole("button", { name: "Clear all" }).click();
  await expect(list.getByText("No notifications")).toBeVisible();
  await runyard.page.keyboard.press("Escape");
  await runyard.page.reload();
  await closePicker(runyard.page);
  await expect(cards.getByRole("status")).toHaveCount(2);
});

test("[DESKTOP-NOTIFICATIONS-12] 减弱动态时卡片进出都只有透明度", async ({ launch }) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  await runyard.page.emulateMedia({ reducedMotion: "reduce" });
  await runyard.page.evaluate(() =>
    localStorage.setItem(
      "runyard.notifications.v1",
      JSON.stringify([
        {
          id: "one",
          at: Date.now(),
          required: true,
          tone: "accent",
          icon: "info",
          title: { key: "desktop.window.title" },
        },
      ]),
    ),
  );
  await runyard.page.reload();
  await closePicker(runyard.page);
  const card = runyard.page.locator("[data-notification-cards]").getByRole("status");
  await expect(card).toBeVisible();
  // 查询浏览器实际解析的媒体规则，而不是靠截图猜测动画中是否有位移。
  const frames = await card.evaluate((element) => {
    const name = getComputedStyle(element).animationName;
    const result: Record<string, string>[] = [];
    const inspect = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule && matchMedia(rule.conditionText).matches)
          inspect(rule.cssRules);
        if (rule instanceof CSSKeyframesRule && rule.name === name)
          result.push(
            ...Array.from(rule.cssRules)
              .filter((frame): frame is CSSKeyframeRule => frame instanceof CSSKeyframeRule)
              .map((frame) => ({
                opacity: frame.style.opacity,
                transform: frame.style.transform,
              })),
          );
      }
    };
    for (const sheet of document.styleSheets) inspect(sheet.cssRules);
    return result.slice(-2);
  });
  expect(frames).toEqual([
    { opacity: "0", transform: "" },
    { opacity: "1", transform: "" },
  ]);
  await card.getByRole("button").click();
  await expect(card).toHaveAttribute("data-closing", "true");
  await expect(card).toHaveCount(0);
});

test("[DESKTOP-NOTIFICATIONS-10] 通知入口在资源库、收起侧栏和项目标签的位置相同", async ({
  launch,
}) => {
  const runyard = await launch();
  await closePicker(runyard.page);
  await runyard.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
  );
  const bell = runyard.page.getByRole("button", { name: "Notifications" });
  const original = await bell.boundingBox();
  expect(original).not.toBeNull();
  await runyard.page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect.poll(async () => (await bell.boundingBox())?.x).toBe(original?.x);
  await runyard.cli("new", "html", "notice-position");
  const library = await runyard.call<{ playgrounds: { id: string; name: string }[] }>(
    "library.get",
  );
  const id = library.playgrounds.find((item) => item.name === "notice-position")?.id;
  expect(id).toBeTruthy();
  await runyard.call("tab.open", id);
  await expect(runyard.page.getByRole("tab", { name: /notice-position/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(async () => (await bell.boundingBox())?.x).toBe(original?.x);
});
