import { expect, type Page } from "@playwright/test";
import { createTranslator, desktopCatalogs, type TranslatorLocale } from "@runyard/i18n";
import type { SceneId } from "./scenes.ts";

/** 只通过正常UI和主进程事件契约切换画面，不改React内部状态或伪造页面DOM。 */
export async function prepareScene(page: Page, scene: SceneId, locale: TranslatorLocale) {
  const { t } = createTranslator({ locale, platform: "darwin", catalogs: desktopCatalogs });
  await expect(page.locator("#root > *").first()).toBeVisible();
  if (scene === "Empty") {
    await expect(page.getByRole("combobox")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  if (["Picker", "CreateDialog", "CreateDialogOn"].includes(scene)) {
    await page.evaluate(() =>
      (window as unknown as { sceneEvents: (name: string) => void }).sceneEvents("picker.open"),
    );
    await expect(page.getByRole("combobox")).toBeVisible();
    if (scene !== "Picker") {
      await page.getByRole("option").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      if (scene === "CreateDialogOn") await page.getByRole("switch").click();
    }
  }
  if (scene === "NoResults") {
    await page.getByRole("textbox", { name: t("library.search.label") }).fill("absent-fixture");
    await expect(page.getByRole("table")).toHaveCount(0);
  }
  if (
    [
      "RowMenu",
      "RenameInline",
      "DeleteConfirm",
      "AutoCleanDialog",
      "SaveTemplate",
      "WorkspaceMenu",
      "WorkspaceRename",
    ].includes(scene)
  ) {
    if (scene !== "WorkspaceMenu" && scene !== "WorkspaceRename")
      await page.getByRole("row").filter({ hasText: "landing-hero" }).hover();
    await page
      .getByRole("button", {
        name: t("library.row.more.aria", { name: "landing-hero" }),
        exact: true,
      })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();
    if (scene === "RenameInline" || scene === "WorkspaceRename") {
      await page
        .getByRole("menuitem", { name: t("library.row.rename.action"), exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: t("desktop.create.name.label"), exact: true }),
      ).toHaveValue("landing-hero");
    }
    if (scene === "DeleteConfirm")
      await page
        .getByRole("menuitem", { name: t("library.row.trash.action"), exact: true })
        .click();
    if (scene === "AutoCleanDialog")
      await page.getByRole("menuitem", { name: t("library.row.autoClean.action") }).click();
    if (scene === "SaveTemplate")
      await page
        .getByRole("menuitem", { name: t("library.row.saveAsTemplate.action"), exact: true })
        .click();
    if (["DeleteConfirm", "AutoCleanDialog", "SaveTemplate", "WorkspaceRename"].includes(scene))
      await expect(page.getByRole("dialog").or(page.getByRole("alertdialog"))).toBeVisible();
  }
  if (scene === "RunningPopover")
    await page
      .getByRole("button", { name: t("library.topbar.running.label", { count: 1 }), exact: true })
      .click();
  if (scene === "Templates") {
    await page
      .getByRole("navigation")
      .getByRole("button", {
        name: new RegExp(t("library.nav.templates.label").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    await expect(page.getByRole("listbox")).toBeVisible();
  }
  if (scene === "NotifyCenter") {
    await expect(page.locator("[data-notification-cards] [role=status]")).toHaveCount(3);
    await page.getByRole("button", { name: t("desktop.notifications.title"), exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  if (scene === "Notify")
    await expect(page.locator("[data-notification-cards] [role=status]")).toHaveCount(3);
  if (["AgentActivity", "CleanReminder", "Update"].includes(scene))
    await expect(page.locator("[data-notification-cards] [role=status]")).toHaveCount(1);
  if (scene === "Service") {
    await page.getByRole("button", { name: t("desktop.request.send.action"), exact: true }).click();
    await expect(page.locator('[data-request-response="response"]')).toBeVisible();
    await expect(page.getByText("Contract response", { exact: false })).toBeVisible();
  }
  const required: Partial<Record<SceneId, string>> = {
    Main: "table",
    MainNarrow: "table",
    FolderMissing: "[data-missing-note]",
    Creating: "[data-start-progress]",
    Missing: '[data-failure-screen="missing"]',
    Web: "[data-preview-slot]",
    AttachedRun: "[data-preview-slot]",
    Service: "[data-request-panel]",
    Stopped: "[data-preview-stopped]",
    Crashed: '[data-failure-screen="crashed"]',
    StartFailed: '[data-failure-screen="start-failed"]',
    Script: "[data-script-output]",
    ScriptRunning: "[data-script-output]",
    ScriptStale: "[data-script-stale]",
    ScriptFailed: "[data-script-failure]",
    UrlConfirm: "[data-link-confirm]",
    RunningPopover: "[data-running-popover]",
  };
  const selector = required[scene];
  if (selector) await expect(page.locator(selector).first()).toBeVisible();
  if (scene === "Empty")
    await expect(page.getByText(t("library.empty.title"), { exact: true })).toBeVisible();
  if (scene === "NoResults")
    await expect(
      page.getByText(t("library.noResults.title", { query: "absent-fixture" }), { exact: true }),
    ).toBeVisible();
  if (scene === "Settings" || scene === "SettingsNarrow")
    await expect(page.locator("[data-settings-section]")).toHaveCount(5);
  if (scene === "SettingsNarrow") {
    const target = page.getByRole("button", { name: t("settings.editRun.title"), exact: true });
    await target.click();
    await expect(target).toHaveAttribute("aria-current", "location");
  }
  await page.evaluate(() => document.fonts.ready);
  // 只在滚动条回到可观察的空闲状态后取证，不用固定睡眠或修改产品计时。
  await expect(page.locator("[data-orientation][data-active]")).toHaveCount(0);
  if (scene === "SettingsNarrow")
    await expect(
      page.getByRole("button", { name: t("settings.editRun.title"), exact: true }),
    ).toHaveAttribute("aria-current", "location");
}
