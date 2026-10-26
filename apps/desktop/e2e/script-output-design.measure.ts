import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { launchRunyard } from "./support/launch.ts";

// 真实脚本项目取证：设计示例是 Python，应用用随包 Node 模板验证同一输出/终端布局。
const out = process.env.RUNYARD_SCRIPT_REVIEW_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-script-"));
mkdirSync(out, { recursive: true });
const repo = resolve(import.meta.dirname, "../../..");
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  for (const theme of ["light", "dark"] as const) {
    for (const lang of ["zh-CN", "en"] as const) {
      const app = await launchRunyard({ theme, lang });
      try {
        await expect(app.page.getByRole("combobox")).toBeFocused();
        await app.page.keyboard.press("Escape");
        await app.cli("new", "node-ts", "script-review");
        let id: string | undefined;
        await expect
          .poll(async () => {
            const state = await app.call<{ playgrounds: { id: string; name: string }[] }>(
              "library.get",
            );
            id = state.playgrounds.find((p) => p.name === "script-review")?.id;
            return id;
          })
          .toBeTruthy();
        await app.call("tab.open", id);
        await expect(app.page.locator("[data-script-output]").getByRole("log")).toContainText(
          "Hello, Runyard!",
        );
        for (const width of [1440, 1100]) {
          await app.app.evaluate(
            ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setContentSize(w, 900),
            width,
          );
          await app.page.setViewportSize({ width, height: 900 });
          const panel = app.page.locator("[data-console]");
          await expect(panel.getByRole("log")).toHaveCount(0);
          await expect(panel.locator("[data-terminal-host]")).toHaveCount(0);
          await expect(panel.getByRole("button")).toHaveCount(1);
          const name = `${width}-${theme}-${lang}`;
          await app.page.evaluate(() => document.fonts.ready);
          const actual = await app.page.screenshot({
            path: join(out, `${name}-app.png`),
            scale: "css",
          });
          const board = `Script${theme === "dark" ? "Dark" : ""}${lang === "en" ? "En" : ""}`;
          const design = readFileSync(join(repo, "tooling/design-render/png", `${board}.png`));
          const compare = await browser.newPage({
            viewport: { width: 1440 + width + 16, height: 980 },
          });
          await compare.setContent(
            `<style>body{margin:0;background:#ddd;font:16px sans-serif}header{padding:12px}main{display:flex;gap:16px;align-items:start}img{display:block}</style><header>#464 ${name}：左为 Script 设计，右为真实 Node 脚本。底部仅终端入口，输出只在右侧。设计板为1440宽。</header><main><img width="1440" src="data:image/png;base64,${design.toString("base64")}"><img width="${width}" src="data:image/png;base64,${actual.toString("base64")}"></main>`,
          );
          await compare.screenshot({ path: join(out, `${name}-comparison.png`), fullPage: true });
          await compare.close();
        }
      } finally {
        await app.shutdown();
      }
    }
  }
} finally {
  await browser.close();
}
writeFileSync(
  join(out, "README.md"),
  "#464：八组真实脚本布局对照。模板/输出示例不同；窗口顶部与编辑器样式沿现状，由其他已登记任务处理。\n",
);
console.log(out);
