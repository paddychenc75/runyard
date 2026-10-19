import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";

const out = process.env.RUNYARD_NOTIFICATION_OUTPUT;
if (!out) throw new Error("请设置 RUNYARD_NOTIFICATION_OUTPUT 为临时证据目录");
mkdirSync(out, { recursive: true });
const repo = join(import.meta.dirname, "../../..");
const chrome = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const records = [
  {
    id: "update",
    at: Date.now(),
    required: true,
    tone: "accent",
    icon: "refresh",
    title: { key: "desktop.update.region.aria" },
    description: {
      key: "desktop.update.banner.label",
      values: { latest: "1.0.1", current: "1.0.0" },
    },
    actions: [
      { id: "update.download", label: { key: "desktop.update.download.action" }, primary: true },
      { id: "update.later", label: { key: "desktop.update.later.action" } },
    ],
  },
  {
    id: "clean",
    at: Date.now(),
    required: true,
    tone: "warning",
    icon: "warning",
    title: { key: "library.cleanBanner.lead.label", values: { count: 1 } },
    description: { key: "library.cleanBanner.idle.label", values: { days: 29 } },
    actions: [
      { id: "clean.keep", label: { key: "library.clean.keep.action" }, primary: true },
      { id: "clean.now", label: { key: "library.clean.now.action" } },
    ],
  },
  {
    id: "agent",
    at: Date.now() - 3600000,
    required: false,
    tone: "violet",
    icon: "spark",
    title: {
      key: "desktop.agentNotice.meta.label",
      values: { url: "Codex · node-ts-1", time: "1h" },
    },
  },
];
try {
  for (const theme of ["light", "dark"] as const)
    for (const lang of ["zh-CN", "en"] as const) {
      const instance = await launchRunyard({ theme, lang });
      try {
        await expect(instance.page.getByRole("combobox")).toBeFocused();
        await instance.page.keyboard.press("Escape");
        await instance.cli("new", "html", "react-counter");
        await expect
          .poll(async () =>
            (
              await instance.call<{ playgrounds: { name: string }[] }>("library.get")
            ).playgrounds.some((item) => item.name === "react-counter"),
          )
          .toBe(true);
        await instance.page.evaluate(
          (items) => localStorage.setItem("runyard.notifications.v1", JSON.stringify(items)),
          records,
        );
        await instance.page.reload();
        for (const width of [1440, 1100]) {
          await instance.app.evaluate(
            ({ BrowserWindow }, size) =>
              BrowserWindow.getAllWindows()[0]?.setContentSize(size, 900),
            width,
          );
          const cards = instance.page.locator("[data-notification-cards]");
          await expect(cards.getByRole("status")).toHaveCount(2);
          for (const mode of ["cards", "center"] as const) {
            if (mode === "center")
              await instance.page.locator("[data-notifications-toggle]").click();
            const board = `Notify${mode === "center" ? "Center" : ""}${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
            const name = `${width}-${theme}-${lang}-${mode}`;
            const designPage = await chrome.newPage({
              viewport: { width: 1440, height: 900 },
              deviceScaleFactor: 1,
            });
            await designPage.goto(
              pathToFileURL(join(repo, "tooling/design-render/build", `${board}.html`)).href,
            );
            const design = await designPage.screenshot({
              path: join(out, `${name}-design.png`),
              scale: "css",
            });
            await designPage.close();
            const actual = await instance.page.screenshot({
              path: join(out, `${name}-app.png`),
              scale: "css",
            });
            const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#ddd;font:14px system-ui}main{display:flex;gap:12px}figure{margin:0;flex:none}figure:first-child{width:1440px}figure:last-child{width:${width}px}img{width:100%}</style><main><figure><figcaption>设计稿 ${board}</figcaption><img src="data:image/png;base64,${design.toString("base64")}"></figure><figure><figcaption>真实打包应用：${width} / ${theme} / ${lang}；#462骨架替身，真实来源接入见#463</figcaption><img src="data:image/png;base64,${actual.toString("base64")}"></figure></main>`;
            writeFileSync(join(out, `${name}.html`), html);
            const pair = await chrome.newPage({
              viewport: { width: 1440 + width + 12, height: 940 },
              deviceScaleFactor: 1,
            });
            await pair.setContent(html);
            await pair.screenshot({ path: join(out, `${name}-comparison.png`) });
            await pair.close();
            if (mode === "center") await instance.page.keyboard.press("Escape");
          }
        }
      } finally {
        await instance.shutdown();
      }
    }
} finally {
  await chrome.close();
}
console.log(`通知骨架16组对照已写入 ${out}`);
