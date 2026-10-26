import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { RunyardApp } from "./launch.ts";

/** 导航当前测试实例的主窗口设置页面，不依赖系统最前面的窗口。 */
export async function openSettingsPage(runyard: RunyardApp): Promise<Page> {
  await runyard.call("settings.open");
  const page = runyard.page;
  await expect(page.getByRole("heading", { name: /^(Settings|设置)$/, level: 1 })).toBeVisible();
  return page;
}
