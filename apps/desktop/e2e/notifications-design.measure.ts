import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";

interface LibraryState {
  playgrounds: { id: string; name: string; [key: string]: unknown }[];
  notices?: { id: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

const out = process.env.RUNYARD_NOTIFICATION_OUTPUT;
if (!out) throw new Error("请设置 RUNYARD_NOTIFICATION_OUTPUT 为临时证据目录");
mkdirSync(out, { recursive: true });
const repo = join(import.meta.dirname, "../../..");
const chrome = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
async function seedSources(instance: Awaited<ReturnType<typeof launchRunyard>>) {
  for (const name of ["react-counter", "node-ts-1", "react19-5"])
    await instance.cli("new", "html", name);
  await expect
    .poll(async () => (await instance.call<LibraryState>("library.get")).playgrounds.length)
    .toBe(3);
  const base = await instance.call<LibraryState>("library.get");
  const clean = base.playgrounds.find((row) => row.name === "node-ts-1");
  const agent = base.playgrounds.find((row) => row.name === "react19-5");
  if (!clean || !agent) throw new Error("通知设计替身项目未就绪");
  const now = Date.now();
  const fixture: LibraryState = {
    ...base,
    update: { latest: "0.3.0", current: "0.2.0" },
    updateReady: true,
    cleanDueCount: 1,
    cleanReminder: [{ id: clean.id, name: clean.name, idleDays: 29 }],
    playgrounds: base.playgrounds.map((row) =>
      row.id === clean.id
        ? {
            ...row,
            autoClean: { enabled: true, days: 30 },
            lastUsedAt: now - 29 * 86400000 - 3600000,
          }
        : row,
    ),
    notices: [
      {
        id: "design-agent",
        kind: "agent-run",
        playgroundId: agent.id,
        name: agent.name,
        agent: "Claude Code",
        url: "http://127.0.0.1:7113/",
        at: now,
      },
      { id: "design-link", kind: "link", code: "open-missing", value: "vue-drag-list" },
      { id: "design-path", kind: "path-near-limit", name: "long-project", length: 240, limit: 255 },
    ],
  };
  await instance.app.evaluate(({ ipcMain }, initial) => {
    const handlers = (
      ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> }
    )._invokeHandlers;
    const original = handlers.get("desktop:call");
    if (!original) throw new Error("通知设计缺少桥接处理器");
    let state = initial;
    ipcMain.removeHandler("desktop:call");
    ipcMain.handle("desktop:call", (event, method, ...args) => {
      if (method === "library.get") return state;
      if (method === "notice.dismiss") {
        state = { ...state, notices: (state.notices ?? []).filter((item) => item.id !== args[0]) };
        return;
      }
      if (method === "clean.shown") return;
      return original(event, method, ...args);
    });
  }, fixture);
  await instance.page.clock.install({ time: now });
  await instance.page.clock.pauseAt(now);
  await instance.page.reload();
}

try {
  for (const theme of ["light", "dark"] as const)
    for (const lang of ["zh-CN", "en"] as const) {
      const instance = await launchRunyard({ theme, lang });
      try {
        await expect(instance.page.getByRole("combobox")).toBeFocused();
        await instance.page.keyboard.press("Escape");
        await seedSources(instance);
        for (const width of [1440, 1100]) {
          await instance.app.evaluate(
            ({ BrowserWindow }, size) =>
              BrowserWindow.getAllWindows()[0]?.setContentSize(size, 900),
            width,
          );
          const cards = instance.page.locator("[data-notification-cards]");
          await expect(cards.getByRole("status")).toHaveCount(3);
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
            const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#ddd;font:14px system-ui}main{display:flex;gap:12px}figure{margin:0;flex:none}figure:first-child{width:1440px}figure:last-child{width:${width}px}img{width:100%}</style><main><figure><figcaption>设计稿 ${board}</figcaption><img src="data:image/png;base64,${design.toString("base64")}"></figure><figure><figcaption>真实打包应用：${width} / ${theme} / ${lang}；#463来源契约替身，通知与处理入口由真实应用渲染</figcaption><img src="data:image/png;base64,${actual.toString("base64")}"></figure></main>`;
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
console.log(`通知来源16组对照已写入 ${out}`);
