import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { RunyardApp } from "./launch.ts";

/** 只找当前测试实例创建的设置窗口，不依赖系统最前面的窗口。 */
export async function openSettingsWindow(runyard: RunyardApp): Promise<Page> {
  const existing = runyard.app.windows().find((page) => page.url().includes("view=settings"));
  const opened = existing ? Promise.resolve(existing) : runyard.app.waitForEvent("window");
  await runyard.call("settings.open");
  const page = await opened;
  await expect(page.getByRole("heading", { name: /^(Settings|设置)$/, level: 1 })).toBeVisible();
  return page;
}
