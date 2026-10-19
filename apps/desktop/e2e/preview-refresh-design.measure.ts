import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";
import {
  holdPreviewRequest,
  openRefreshFixture,
  releasePreviewRequest,
} from "./preview-refresh-fixture.ts";
import { launchRunyard } from "./support/launch.ts";

// 八组设计对照是取证工具，不放进测试匹配范围；真实项目、临时主目录，没有注入产品状态。
const repo = resolve(import.meta.dirname, "..", "..", "..");
const output = process.env.RUNYARD_REFRESH_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-refresh-"));
mkdirSync(output, { recursive: true });
console.log(`刷新设计取证目录：${output}`);
const realDirectories = [join(homedir(), ".runyard"), join(homedir(), "Runyard")];
const mtimes = () =>
  realDirectories.map((path) => (existsSync(path) ? statSync(path).mtimeMs : null));
const before = mtimes();
const measurements: unknown[] = [];
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const comparison = await browser.newPage();
  for (const lang of ["zh-CN", "en"] as const)
    for (const theme of ["light", "dark"] as const) {
      const board = `Web${theme === "light" ? "Light" : ""}${lang === "en" ? "En" : ""}`;
      const designPath = join(repo, "tooling", "design-render", "build", `${board}.html`);
      if (!existsSync(designPath))
        throw new Error(
          "先运行 node tooling/design-render/render.mjs Web WebEn WebLight WebLightEn --no-shots",
        );
      const instance = await launchRunyard({ lang, theme });
      try {
        await openRefreshFixture(instance);
        for (const width of [1440, 1100]) {
          const height = width === 1440 ? 900 : 800;
          const name = `${board}-${width}`;
          await instance.app.evaluate(
            ({ BrowserWindow }, size) =>
              BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height),
            { width, height },
          );
          await instance.page.setViewportSize({ width, height });
          await expect.poll(() => instance.page.evaluate(() => innerWidth)).toBe(width);
          await expect.poll(() => instance.page.evaluate(() => innerHeight)).toBe(height);
          await instance.page.evaluate(() => document.fonts.ready);
          const reload = instance.page.getByRole("button", {
            name: lang === "en" ? "Reload" : "刷新",
            exact: true,
          });
          await holdPreviewRequest(instance);
          await reload.click();
          await expect(reload).toHaveAttribute("data-refreshing", "true");
          const geometry = await reload.evaluate((button) => {
            const icon = button.querySelector("svg");
            return {
              button: button.getBoundingClientRect().toJSON(),
              icon: icon?.getBoundingClientRect().toJSON(),
              animation: icon ? getComputedStyle(icon).animationName : null,
            };
          });
          // 固定在动效四分之一圈，仅固定截图采样时刻；网络请求仍真实挂起。
          await reload.locator("svg").evaluate((svg) => {
            for (const animation of svg.getAnimations()) {
              animation.pause();
              const duration = animation.effect?.getTiming().duration;
              if (typeof duration === "number") animation.currentTime = duration / 4;
            }
          });
          await instance.page.screenshot({
            path: join(output, `${name}-loading.png`),
            scale: "css",
          });
          await reload.locator("svg").evaluate((svg) => {
            for (const animation of svg.getAnimations()) animation.play();
          });
          await releasePreviewRequest(instance);
          await expect(reload).not.toHaveAttribute("data-refreshing", "true");
          // Playwright 截主界面，另附原生预览页面截图，避免把 WebContentsView 的空白当成产品画面。
          const slot = await instance.page.locator("[data-preview-slot]").boundingBox();
          if (!slot) throw new Error("预览占位区域不可见");
          const expectedBounds = {
            x: Math.round(slot.x),
            y: Math.round(slot.y),
            width: Math.round(slot.width),
            height: Math.round(slot.height),
          };
          await expect
            .poll(() =>
              instance.app.evaluate(({ BrowserWindow, WebContentsView }) => {
                const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find(
                  (child) =>
                    child instanceof WebContentsView &&
                    child.webContents.getURL().startsWith("http://127.0.0.1:"),
                );
                return view?.getBounds();
              }),
            )
            .toEqual(expectedBounds);
          let previewPng = "";
          // did-stop-loading 早于原生绘制提交；等捕获图真正含页面文字，不能把空白首帧交付为证据。
          await expect
            .poll(async () => {
              const capture = await instance.app.evaluate(async ({ webContents }) => {
                const preview = webContents
                  .getAllWebContents()
                  .find((contents) => contents.getURL().startsWith("http://127.0.0.1:"));
                if (!preview) throw new Error("找不到原生预览");
                const image = await preview.capturePage();
                const bitmap = image.toBitmap();
                let ink = 0;
                for (let pixel = 0; pixel < bitmap.length; pixel += 4) {
                  if (
                    (bitmap[pixel] ?? 255) < 100 &&
                    (bitmap[pixel + 1] ?? 255) < 100 &&
                    (bitmap[pixel + 2] ?? 255) < 100 &&
                    (bitmap[pixel + 3] ?? 0) > 0
                  )
                    ink++;
                }
                return { png: image.toPNG().toString("base64"), ink };
              });
              previewPng = capture.png;
              return capture.ink;
            })
            .toBeGreaterThan(100);
          writeFileSync(join(output, `${name}-preview.png`), Buffer.from(previewPng, "base64"));
          let appImage = await instance.page.screenshot({
            path: join(output, `${name}-app.png`),
            scale: "css",
          });
          await comparison.setViewportSize({ width, height });
          // 按同一窗口的真实占位坐标合成，保留主界面与原生预览的原图。
          await comparison.setContent(
            `<!doctype html><style>body{margin:0}img{position:absolute}</style><img width="${width}" height="${height}" src="data:image/png;base64,${appImage.toString("base64")}"><img style="left:${slot.x}px;top:${slot.y}px;width:${slot.width}px;height:${slot.height}px" src="data:image/png;base64,${previewPng}">`,
          );
          await comparison
            .locator("img")
            .evaluateAll((images) =>
              Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
            );
          appImage = await comparison.screenshot({
            path: join(output, `${name}-app-composited.png`),
          });
          await comparison.goto(pathToFileURL(designPath).href);
          await comparison.evaluate(() => document.fonts.ready);
          // Web 系列没有 1100 画板；保留原1440布局并裁取，明确它不是窄窗设计验收。
          const designImage = await comparison.screenshot({
            path: join(output, `${name}-design.png`),
          });
          await comparison.setViewportSize({ width: width * 2, height: height + 40 });
          const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px system-ui}.pair{display:flex}figure{margin:0}figcaption{height:40px;line-height:40px}img{display:block;width:${width}px;height:${height}px}</style><div class="pair"><figure><figcaption>${board} 设计稿${width === 1100 ? "（原1440画板裁取）" : ""}</figcaption><img src="data:image/png;base64,${designImage.toString("base64")}"></figure><figure><figcaption>真实应用（原生预览按坐标合成） · ${lang} · ${theme} · ${width}</figcaption><img src="data:image/png;base64,${appImage.toString("base64")}"></figure></div>`;
          writeFileSync(join(output, `${name}-comparison.html`), html);
          await comparison.setContent(html);
          await comparison
            .locator("img")
            .evaluateAll((images) =>
              Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
            );
          await comparison.screenshot({ path: join(output, `${name}-comparison.png`) });
          measurements.push({ name, width, height, geometry, previewBounds: expectedBounds });
        }
      } finally {
        await instance.shutdown();
      }
    }
} finally {
  await browser.close();
  const after = mtimes();
  writeFileSync(
    join(output, "measurements.json"),
    JSON.stringify({ before, after, measurements }, null, 2),
  );
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    console.error("真实数据目录修改时间变化，请检查");
    process.exitCode = 1;
  }
}
writeFileSync(
  join(output, "README.md"),
  `# 刷新动效设计对照\n\n八组：浅深 × 中英 × 1440/1100。Web/WebEn/WebLight/WebLightEn 用原始设计源展开。Web 系列没有1100专用画板，因此1100设计图是1440画板左侧裁取，不作为窄窗布局一致的证明。\n\n应用用真实静态项目展示可重置计数；设计稿的React计数器、其他标签及文件树是演示内容差异。原生预览单独附 preview.png，主界面原始截图 app.png 的预览区域可能为空；并排图使用 app-composited.png，将同一窗口预览截图按真实占位坐标合成。loading.png 固定在刷新四分之一圈，正常 app-composited.png 用于检查静止外观。刷新生命周期、真实页面计数重置、减少动态和失败恢复另由 preview-refresh.e2e.ts 验证。\n\n若本机 7100 被占用，应用真实显示端口回退提示，保留该环境差异，不结束其他应用占用的端口。静态设计没有刷新中状态，这是本次负责人批准的新增动效；停止图标使用已合并 #475，旧设计里的小方框不再是目标。侧栏/顶栏等既有差异沿用 #448/#446 后续任务，本改动不宣称完成这些画面。\n\n提交：${process.env.GITHUB_SHA ?? "本地工作树"}。真实 ~/.runyard 和 ~/Runyard 修改时间见 measurements.json。\n`,
);
console.log(`八组对照已保存：${output}`);
