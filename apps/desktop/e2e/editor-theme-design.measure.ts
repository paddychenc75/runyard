import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareScrollbars, openScrollableEditor } from "./support/editor-theme.ts";
import { launchRunyard } from "./support/launch.ts";

// 视觉规范§5要求第三方滚动条使用共享主题；对照两种真实控件，不绘制替代色块。
const output = process.env.RUNYARD_THEME_OUTPUT;
if (!output) throw new Error("请设置 RUNYARD_THEME_OUTPUT 取证目录");
mkdirSync(output, { recursive: true });
const measurements: unknown[] = [];
for (const lang of ["zh-CN", "en"] as const) {
  const instance = await launchRunyard({ lang, theme: "light" });
  try {
    await openScrollableEditor(instance);
    for (const theme of ["light", "dark"] as const) {
      for (const width of [1440, 1100]) {
        const height = 900;
        await instance.app.evaluate(
          ({ BrowserWindow }, size) => {
            BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
          },
          { width, height },
        );
        await instance.page.setViewportSize({ width, height });
        const result = await compareScrollbars(instance, theme);
        const name = `${lang}-${theme}-${width}`;
        await instance.page.screenshot({ path: join(output, `${name}-app.png`), scale: "css" });
        await result.shared.hover();
        const shared = await result.shared.screenshot({
          path: join(output, `${name}-shared.png`),
          scale: "css",
        });
        await result.monaco.hover();
        const monaco = await result.monaco.screenshot({
          path: join(output, `${name}-monaco.png`),
          scale: "css",
        });
        const png = await instance.page.evaluate(
          async ({ left, right }) => {
            const images = await Promise.all(
              [left, right].map(async (data) => {
                const image = new Image();
                image.src = `data:image/png;base64,${data}`;
                await image.decode();
                return image;
              }),
            );
            const canvas = document.createElement("canvas");
            canvas.width = 560;
            canvas.height = Math.max(...images.map((image) => image.height)) * 3 + 75;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("缺少对照画布");
            context.fillStyle = getComputedStyle(document.body).backgroundColor;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = getComputedStyle(document.body).color;
            context.font = "16px system-ui";
            context.fillText("共享 ScrollArea（实际）", 20, 30);
            context.fillText("Monaco（实际）", 300, 30);
            for (const [index, data] of [left, right].entries()) {
              const image = new Image();
              image.src = `data:image/png;base64,${data}`;
              await image.decode();
              context.drawImage(image, 80 + index * 280, 55, image.width * 3, image.height * 3);
            }
            return canvas.toDataURL("image/png").split(",")[1] ?? "";
          },
          { left: shared.toString("base64"), right: monaco.toString("base64") },
        );
        writeFileSync(join(output, `${name}-comparison.png`), Buffer.from(png, "base64"));
        const { monaco: _monaco, shared: _shared, ...colors } = result;
        measurements.push({ name, ...colors });
      }
    }
  } finally {
    await instance.shutdown();
  }
}
writeFileSync(join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
console.log(`八组实窗和真实滚动条对照：${output}`);
