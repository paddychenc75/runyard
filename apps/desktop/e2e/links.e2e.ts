import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { attachScreenshot, closePicker, expect, test } from "./support/fixtures.ts";
import type { RunyardApp } from "./support/launch.ts";

// runyard:// 链接和更新提示（#190、#191、#192）：不向系统登记协议，也不碰真实的 GitHub。
// 系统把链接交给应用靠 open-url 事件，所以这里直接在应用进程里发这个事件（冷启动靠系统登记，只能在打包后手动验证）。

type Library = {
  playgrounds: {
    name: string;
    note: string;
    autoClean: { enabled: boolean; days: number | null };
  }[];
};

async function openLink(runyard: RunyardApp, address: string): Promise<void> {
  await runyard.app.evaluate(({ app }, url) => {
    app.emit("open-url", { preventDefault() {} }, url);
  }, address);
}

// 空资源库启动时会自动打开模板选择器；中文界面里它的搜索框叫“搜索模板”
async function closeZhPicker(page: Page): Promise<void> {
  await expect(page.getByRole("combobox", { name: "搜索模板" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

const dialog = (page: Page) => page.getByRole("alertdialog");

test("链接：open 打开已有项目，不存在的项目给提示", async ({ launch }, info) => {
  const runyard = await launch();
  const { page } = runyard;
  await runyard.cli("new", "html", "demo");
  await closePicker(page);
  await openLink(runyard, "runyard://open/nope");
  await expect(page.getByRole("region", { name: "Notices" })).toContainText(
    "There is no playground named nope",
  );
  await openLink(runyard, "runyard://open/demo");
  await expect(page.getByRole("tab", { name: /demo/ })).toBeVisible();
  await expect
    .poll(async () => (await runyard.cli("status")) as { playgrounds: { name: string }[] })
    .toMatchObject({ playgrounds: [{ name: "demo" }] });
  await attachScreenshot(page, info, "open-link");
});

test("链接：new 每次都确认，回车是取消，确认后新建并运行", async ({ launch }, info) => {
  const runyard = await launch({ lang: "zh-CN" });
  const { page } = runyard;
  await closeZhPicker(page);
  await runyard.cli("new", "html", "seed");
  await openLink(runyard, "runyard://new/html?source=docs.example.dev&cmd=rm%20-rf");
  const box = dialog(page);
  await expect(box).toContainText("要新建并运行这个项目吗？");
  await expect(box).toContainText("自称来自docs.example.dev");
  await expect(box).not.toContainText("rm");
  await expect(box.getByRole("button", { name: "取消" })).toBeFocused();
  await attachScreenshot(page, info, "url-confirm");
  // 回车就是取消：什么都没创建
  await page.keyboard.press("Enter");
  await expect(box).toHaveCount(0);
  expect((await runyard.call<Library>("library.get")).playgrounds).toHaveLength(1);
  // 确认框开着时又来的链接被丢弃
  await openLink(runyard, "runyard://new/html?name=landing&note=%E9%A6%96%E9%A1%B5&clean-after=7d");
  await expect(box).toContainText("landing");
  await openLink(runyard, "runyard://new/vue3");
  await expect(page.getByRole("region", { name: "提示" })).toContainText(
    "已有一个待确认的新建请求",
  );
  await expect(box).toContainText("landing");
  await box.getByRole("button", { name: "新建并运行" }).click();
  await expect(page.getByRole("tab", { name: /landing/ })).toBeVisible();
  const created = (await runyard.call<Library>("library.get")).playgrounds;
  expect(created).toHaveLength(2);
  expect(created.find((item) => item.name === "landing")).toMatchObject({
    note: "首页",
    autoClean: { enabled: true, days: 7 },
  });
});

test("更新提示：记录里有新版本就在资源库页顶部显示，“以后再说”后不再出现；从源码运行不联网", async ({
  launch,
}, info) => {
  const runyard = await launch({ lang: "zh-CN" });
  const { page } = runyard;
  await closeZhPicker(page);
  await runyard.cli("new", "html", "seed");
  // 从源码运行时不发请求，只显示记录里已有的：写一份“今天查到了 99.0.0”的记录，再用开关触发重读
  const dir = join(runyard.home, "r", ".runyard", "app-data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "update-check.json"),
    JSON.stringify({
      checkedOn: "2020-01-01",
      latest: {
        version: "99.0.0",
        url: "https://github.com/paddychenc75/runyard/releases/tag/v99.0.0",
      },
      dismissed: null,
    }),
  );
  await runyard.call("settings.set", { updateCheck: false });
  await runyard.call("settings.set", { updateCheck: true });
  const banner = page.getByRole("status", { name: "新版本" });
  await expect(banner).toContainText("Runyard 99.0.0 已发布");
  await attachScreenshot(page, info, "update-banner");
  await banner.getByRole("button", { name: "以后再说" }).click();
  await expect(banner).toHaveCount(0);
});
