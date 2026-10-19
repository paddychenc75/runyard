import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { brandThemeCases, checkBrandTheme } from "./sidebar-brand-theme.ts";
import { launchRunyard } from "./support/launch.ts";

// 只验证本次批准的品牌 A；不把其余侧栏旧设计差异当作这次已实现。
const repo = resolve(import.meta.dirname, "..", "..", "..");
const output = process.env.RUNYARD_BRAND_OUTPUT ?? mkdtempSync(join(tmpdir(), "ry-brand-a-"));
mkdirSync(output, { recursive: true });
console.log(`品牌 A 取证目录：${output}`);
const source = readFileSync(join(import.meta.dirname, "brand-a-reference.html"), "utf8");
const realDirectories = [join(homedir(), ".runyard"), join(homedir(), "Runyard")];
const mtimes = () =>
  realDirectories.map((path) => (existsSync(path) ? statSync(path).mtimeMs : null));
const before = mtimes();
const measurements: unknown[] = [];

async function pair(page: Page, reference: Buffer, actual: Buffer, name: string) {
  const png = await page.evaluate(
    async ({ left, right, label }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1100;
      canvas.height = 230;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("无法创建品牌对照画布");
      context.fillStyle = "#f5f5f7";
      context.fillRect(0, 0, 1100, 230);
      for (const [index, data] of [left, right].entries()) {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        context.drawImage(image, index * 550 + 20, 50, image.width * 2, image.height * 2);
      }
      context.fillStyle = "#222";
      context.font = "16px system-ui";
      context.fillText("批准方案 A（放大预览）", 20, 30);
      context.fillText(`实际 Sidebar · ${label}（均放大2倍）`, 570, 30);
      return canvas.toDataURL("image/png").split(",")[1] ?? "";
    },
    { left: reference.toString("base64"), right: actual.toString("base64"), label: name },
  );
  writeFileSync(join(output, `${name}-comparison.png`), Buffer.from(png, "base64"));
}

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const referencePage = await browser.newPage({ viewport: { width: 240, height: 84 } });
  for (const lang of ["zh-CN", "en"] as const)
    for (const theme of ["light", "dark"] as const) {
      const svg = readFileSync(
        join(
          repo,
          "docs",
          "design",
          "logo",
          "final",
          theme === "dark" ? "icon-32-dark.svg" : "icon-32.svg",
        ),
        "utf8",
      );
      const html = source
        .replace("var(--reference-background)", theme === "dark" ? "#252529" : "#efeff3")
        .replace("var(--reference-color)", theme === "dark" ? "#f4f3f5" : "#202124")
        .replace("{{ICON}}", `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
      await referencePage.setContent(html);
      await referencePage.locator("img").evaluate((image) => (image as HTMLImageElement).decode());
      const reference = await referencePage.screenshot();
      writeFileSync(join(output, `${theme}-approved.html`), html);
      writeFileSync(join(output, `${theme}-approved.png`), reference);
      const instance = await launchRunyard({ lang, theme });
      try {
        const picker = instance.page.getByRole("dialog").getByRole("combobox");
        await expect(picker).toBeFocused();
        await picker.press("Escape");
        await expect(instance.page.getByRole("dialog")).toHaveCount(0);
        for (const width of [1440, 1100]) {
          const name = `${lang}-${theme}-${width}`;
          const height = width === 1440 ? 900 : 800;
          await instance.app.evaluate(
            ({ BrowserWindow }, size) =>
              BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height),
            { width, height },
          );
          await instance.page.setViewportSize({ width, height });
          await expect.poll(() => instance.page.evaluate(() => innerWidth)).toBe(width);
          const brand = instance.page.locator("[data-sidebar-brand]");
          await expect(brand).toBeVisible();
          await expect(brand).toHaveText("Runyard");
          await expect(instance.page.locator("html")).toHaveAttribute("data-theme", theme);
          const visibleImage = brand.locator("img:visible");
          await expect(visibleImage).toHaveCount(1);
          await visibleImage.evaluate((image) => (image as HTMLImageElement).decode());
          await expect(visibleImage).toHaveAttribute("aria-hidden", "true");
          await expect(brand.getByRole("img")).toHaveCount(0);
          const iconData = await visibleImage.getAttribute("src");
          if (!iconData?.startsWith("data:image/svg+xml"))
            throw new Error("品牌图标未内联，检查构建和 CSP");
          const actualSvg = iconData.includes(";base64,")
            ? Buffer.from(iconData.split(",")[1] ?? "", "base64").toString("utf8")
            : decodeURIComponent(iconData.slice(iconData.indexOf(",") + 1));
          expect(actualSvg).toBe(svg);
          await instance.page.evaluate(() => document.fonts.ready);
          const metrics = await brand.evaluate((element) => ({
            width: element.clientWidth,
            scrollWidth: element.scrollWidth,
            font: getComputedStyle(element).fontFamily,
            size: getComputedStyle(element).fontSize,
            weight: getComputedStyle(element).fontWeight,
            tracking: getComputedStyle(element).letterSpacing,
            rect: element.getBoundingClientRect().toJSON(),
          }));
          expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
          const crop = await brand.screenshot({
            path: join(output, `${name}-brand.png`),
            scale: "css",
          });
          await instance.page.screenshot({ path: join(output, `${name}-app.png`), scale: "css" });
          await pair(referencePage, reference, crop, name);
          measurements.push({
            name,
            metrics,
            iconSha256: createHash("sha256").update(svg).digest("hex"),
          });
        }
        if (lang === "en" && theme === "dark") {
          for (const choice of brandThemeCases) {
            const result = await checkBrandTheme(instance.page, choice);
            const name = `theme-${choice.theme}-system-${choice.system}`;
            await instance.page
              .locator("[data-sidebar-brand]")
              .screenshot({ path: join(output, `${name}.png`), scale: "css" });
            measurements.push({ name, ...result });
          }
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
  `# 品牌 A 八组对照\n\n2026-10-19 负责人选 A（#481）：官方应用图标配紧凑 Runyard 字标。本次只改变品牌标题，不改变侧栏筛选/导航；其他侧栏设计仍由 #448 跟进。参考局部保留获批 mock 的34px图标、28px/650字标、-1.15px字距、10px间距；真实Sidebar适配实际宽度为32px图标、28px/700现有字号/字重变量、-0.6px字距、8px间距。两个局部均按原像素2倍放大，完整窗口图另附。\n\n浅深×中英×1440/1100八组均读取真实Electron Sidebar，等待SVG解码，断言只有对应主题图标可见、读屏不重复、品牌不溢出；内联SVG与官方文件逐字节一致，哈希与尺寸见measurements.json。另附四组真实CSS核对：system-light、system-dark、显式light/系统dark、显式dark/系统light；通过Playwright模拟系统媒体查询，仅设置真实根主题标记，不替换CSS或组件。全部运行用临时HOME/root，真实数据目录mtime前后相同。\n\n提交：${process.env.GITHUB_SHA ?? "本地工作树"}。\n`,
);
console.log(`八组品牌对照已保存：${output}`);
