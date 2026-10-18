import { renameSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./support/fixtures.ts";

// 临时：为 PR 截图（不提交）
const OUT = "/private/tmp/claude-501/-Users-fengchen-Desktop-vibe-code/815db63d-d15a-4147-89f8-ffc71e92af22/scratchpad/shots57";
for (const lang of ["zh-CN", "en"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`shots ${lang} ${theme}`, async ({ launch }) => {
      test.setTimeout(180_000);
      const r = await launch({ lang, theme });
      const { page, app } = r;
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(800);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const as = async (agent: string | undefined, fn: () => Promise<unknown>) => {
        const keys = Object.keys(process.env).filter((k) => /^(CLAUDE|CODEX|RUNYARD_AGENT|CURSOR|GEMINI|AIDER)/i.test(k));
        const saved = keys.map((k) => process.env[k]);
        for (const k of keys) delete process.env[k];
        if (agent !== undefined) process.env.RUNYARD_AGENT = agent;
        try { await fn(); } finally {
          keys.forEach((k, i) => { const v = saved[i]; if (v === undefined) delete process.env[k]; else process.env[k] = v; });
        }
      };
      await as(undefined, () => r.cli("new", "html", "landing-hero", "--note", "首页大图区域的排版练习"));
      await as("Claude Code", () => r.cli("new", "hono", "hono-1", "--note", "回显 webhook 请求，核对签名头", "--clean-after", "30d"));
      await as(undefined, () => r.cli("new", "html", "api-notes", "--note", "记录第三方接口的返回值"));
      await as("Claude Code", () => r.cli("new", "react19", "react19-1", "--clean-after", "30d"));
      await as(undefined, () => r.cli("new", "go", "go-channels", "--note", "带缓冲的 channel 与 worker 协作"));
      await as(undefined, () => r.cli("new", "python", "vue-drag-list", "--note", "拖拽排序列表"));
      await r.cli("run", "landing-hero");
      await r.cli("run", "hono-1");
      renameSync(join(r.library, "vue-drag-list"), join(r.root, "moved-away"));
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
      await page.waitForTimeout(3500);
      const tableEl = page.locator("table").first();
      const select = tableEl.getByRole("row").filter({ hasText: "react19-1" });
      await select.click({ position: { x: 300, y: 10 } });
      await tableEl.getByRole("row").filter({ hasText: "go-channels" }).hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/app-${lang}-${theme}-main.png` });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1100, 800));
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/app-${lang}-${theme}-narrow.png` });
    });
  }
}
