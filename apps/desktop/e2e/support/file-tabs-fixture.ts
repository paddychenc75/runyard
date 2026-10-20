import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import type { RunyardApp } from "./launch.ts";

export async function openMany(
  runyard: RunyardApp,
  includeLong = false,
  lang: "en" | "zh-CN" = "en",
) {
  const { page, app } = runyard;
  await expect(page.getByRole("dialog").getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await runyard.cli("new", "html", "tabs-scroll");
  const names = Array.from({ length: 12 }, (_, i) => `module-${String(i).padStart(2, "0")}.ts`);
  if (includeLong) names.push(`module-${"long-name-".repeat(18)}.ts`);
  for (const [index, name] of names.entries())
    await writeFile(
      join(runyard.library, "tabs-scroll", name),
      `export const value = ${index};\n${Array.from({ length: 400 }, (_, line) => `// visible line ${line}`).join("\n")}`,
    );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1100, 800),
  );
  await page
    .getByRole("row")
    .filter({ hasText: "tabs-scroll" })
    .getByRole("button", { name: lang === "en" ? "Open" : "打开", exact: true })
    .click();
  for (const name of names) await page.getByRole("treeitem", { name, exact: true }).click();
  return names;
}
