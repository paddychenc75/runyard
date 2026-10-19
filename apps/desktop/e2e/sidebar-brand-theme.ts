import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export const brandThemeCases = [
  { theme: "system", system: "light", expected: "light" },
  { theme: "system", system: "dark", expected: "dark" },
  { theme: "light", system: "dark", expected: "light" },
  { theme: "dark", system: "light", expected: "dark" },
] as const;

/** 只模拟操作系统媒体查询与根主题标记，真实 Sidebar、CSS、打包图标都不替换。 */
export async function checkBrandTheme(page: Page, choice: (typeof brandThemeCases)[number]) {
  await page.emulateMedia({ colorScheme: choice.system });
  await page.evaluate((theme) => {
    document.documentElement.dataset.theme = theme;
  }, choice.theme);
  const brand = page.locator("[data-sidebar-brand]");
  const visible = brand.locator("img:visible");
  await expect(visible).toHaveCount(1);
  await visible.evaluate((image) => (image as HTMLImageElement).decode());
  const data = await visible.getAttribute("src");
  if (!data?.startsWith("data:image/svg+xml")) throw new Error("品牌图标未内联");
  const svg = data.includes(";base64,")
    ? Buffer.from(data.split(",")[1] ?? "", "base64").toString("utf8")
    : decodeURIComponent(data.slice(data.indexOf(",") + 1));
  const repo = resolve(import.meta.dirname, "..", "..", "..");
  const official = readFileSync(
    join(
      repo,
      "docs",
      "design",
      "logo",
      "final",
      choice.expected === "dark" ? "icon-32-dark.svg" : "icon-32.svg",
    ),
  );
  const actualHash = createHash("sha256").update(svg).digest("hex");
  const expectedHash = createHash("sha256").update(official).digest("hex");
  expect(actualHash, `应用${choice.theme} / 系统${choice.system}应显示${choice.expected}图标`).toBe(
    expectedHash,
  );
  await expect(visible).toHaveAttribute("aria-hidden", "true");
  await expect(brand.getByRole("img")).toHaveCount(0);
  return { ...choice, iconSha256: actualHash };
}
