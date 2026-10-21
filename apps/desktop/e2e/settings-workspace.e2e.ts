import { randomUUID } from "node:crypto";
import type { LibraryState } from "../src/shared/library-state.ts";
import type { TerminalSnapshot } from "../src/shared/terminal.ts";
import { createWithKeyboard, expect, pressMenuShortcut, test } from "./support/fixtures.ts";
import { openLibraryPage } from "./support/library-sidebar.ts";
import { openSettingsPage } from "./support/settings-page.ts";
import { editorProof, rememberEditor } from "./support/settings-proof.ts";

test("[DESKTOP-SETTINGS-45] [DESKTOP-SETTINGS-46] [DESKTOP-SETTINGS-47] 设置保留真实编辑器运行和终端身份，窄窗可返回", async ({
  launch,
}) => {
  const runyard = await launch();
  const { page } = runyard;
  await runyard.call("settings.set", { autoSave: "off" });
  await createWithKeyboard(page);
  await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/:\d+/);
  await page.getByRole("treeitem", { name: "index.html" }).click();
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("<h1>UNSAVED-SETTINGS-PAGE</h1>");
  await expect(page.getByRole("tab", { name: "index.html (unsaved)" })).toBeVisible();
  const text = await rememberEditor(page);
  const before = await runyard.call<LibraryState>("library.get");
  const project = before.activeTab;
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(page.locator(".xterm")).toBeVisible();
  const snapshot = await runyard.call<TerminalSnapshot>("terminal.attach", { project });
  expect(snapshot.state.kind).toBe("running");
  if (snapshot.state.kind !== "running") throw new Error("终端尚未运行");
  const shell = await runyard.platform.proc.identity(snapshot.state.pid);
  const marker = { name: "RY_SETTINGS_COMMAND", value: randomUUID() };
  await runyard.call("terminal.write", {
    project,
    data: `${marker.name}=${marker.value} ${process.execPath} -e "setTimeout(() => {}, 600000)"\r`,
  });
  await expect.poll(async () => (await runyard.platform.proc.findByMarker(marker)).length).toBe(1);
  const child = (await runyard.platform.proc.findByMarker(marker))[0];
  try {
    await page.locator(".xterm").click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await pressMenuShortcut(runyard.app, "CmdOrCtrl+,");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeFocused();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("[data-editor]")).toBeHidden();
    const main = await runyard.app.browserWindow(page);
    expect(
      await main.evaluate(
        (window) =>
          window.contentView.children.filter((view: { getVisible(): boolean }) => view.getVisible())
            .length,
      ),
    ).toBe(0);
    await page.getByRole("textbox", { name: "npm registry" }).fill("https://registry.example.test");
    await page.keyboard.press("Meta+s");
    expect((await editorProof(page)).text).toBe(text);
    const current = await runyard.call<LibraryState>("library.get");
    expect(current.runs).toEqual(before.runs);
    expect(await runyard.platform.proc.identity(snapshot.state.pid)).toEqual(shell);
    expect((await runyard.platform.proc.findByMarker(marker))[0]).toEqual(child);
    await main.evaluate((window) => window.setContentSize(720, 760));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("tab", { name: /html-1/ }).click();
    await expect
      .poll(() => editorProof(page))
      .toEqual({ sameEditor: true, sameModel: true, sameSelection: true, text, focused: true });
    await openSettingsPage(runyard);
    await pressMenuShortcut(runyard.app, "CmdOrCtrl+W");
    await expect
      .poll(() => editorProof(page))
      .toEqual({ sameEditor: true, sameModel: true, sameSelection: true, text, focused: true });
    await expect(page.getByRole("tab", { name: "index.html (unsaved)" })).toBeVisible();
    await page.keyboard.press("Meta+s");
    await openSettingsPage(runyard);
    await openLibraryPage(page);
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toHaveCount(0);
  } finally {
    await runyard.call("terminal.write", { project, data: "\u0003" });
    await expect
      .poll(async () => (await runyard.platform.proc.findByMarker(marker)).length)
      .toBe(0);
  }
});
