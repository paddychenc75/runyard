import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LibraryState } from "../src/shared/library-state.ts";
import type { TerminalSnapshot } from "../src/shared/terminal.ts";
import { createWithKeyboard, expect, previewText, test } from "./support/fixtures.ts";

const shellArg = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

// #267：同一个项目走完全部环节；依赖由夹具提供，真正的npm安装不需要访问注册表。
test("M3整包验收：新建、编辑、预览更新、终端安装并使用依赖、关闭释放", async ({ launch }) => {
  const instance = await launch();
  const { page } = instance;
  const dependency = join(instance.home, "local-dependency");
  mkdirSync(dependency);
  writeFileSync(
    join(dependency, "package.json"),
    JSON.stringify({ name: "m3-local-proof", version: "1.0.0", main: "index.cjs" }),
  );
  writeFileSync(join(dependency, "index.cjs"), "module.exports = 'DEPENDENCY-INSTALLED-267';\n");

  await createWithKeyboard(page);
  await expect.poll(() => previewText(instance.app)).toContain("Clicked 0 times");
  const state = () => instance.call<LibraryState>("library.get");
  const project = (await state()).activeTab;
  expect(project).not.toBe("library");
  const port = (await state()).tabs.find((tab) => tab.id === project)?.port;
  if (!port) throw new Error("预览没有运行端口");
  await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("<h1>M3-EDITOR-PREVIEW-267</h1>");
  await page.keyboard.press("Meta+s");
  await expect.poll(() => previewText(instance.app)).toContain("M3-EDITOR-PREVIEW-267");
  const folder = join(instance.library, "html-1");
  expect(readFileSync(join(folder, "index.html"), "utf8")).toContain("M3-EDITOR-PREVIEW-267");

  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  const terminal = page.locator(".xterm").first();
  await expect(terminal).toBeVisible();
  await expect
    .poll(() => instance.call<TerminalSnapshot>("terminal.attach", { project }))
    .toMatchObject({ state: { kind: "running" } });
  const shell = (await instance.call<TerminalSnapshot>("terminal.attach", { project })).state;
  if (shell.kind !== "running") throw new Error("终端未运行");
  const shellIdentity = await instance.platform.proc.identity(shell.pid);
  expect(shellIdentity).not.toBeNull();
  await terminal.click();
  // 输出标记不出现在输入命令里；只有npm成功安装且Node成功解析依赖才会出现。
  await page.keyboard.type(
    `npm install --offline --ignore-scripts --no-audit --no-fund ${shellArg(dependency)} && node -e "console.log(require('m3-local-proof'))"`,
  );
  await page.keyboard.press("Enter");
  await expect(terminal).toContainText("DEPENDENCY-INSTALLED-267");
  const installed = JSON.parse(
    readFileSync(join(folder, "node_modules", "m3-local-proof", "package.json"), "utf8"),
  );
  expect(installed).toMatchObject({ name: "m3-local-proof", version: "1.0.0" });
  const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
  expect(manifest.dependencies["m3-local-proof"]).toMatch(/^file:/);
  const lock = JSON.parse(readFileSync(join(folder, "package-lock.json"), "utf8"));
  expect(lock.packages["node_modules/m3-local-proof"]).toBeDefined();
  await expect
    .poll(() => instance.call("terminal.status", { project }))
    .toMatchObject({ open: true, command: null });
  expect(await instance.platform.proc.identity(shell.pid)).toEqual(shellIdentity);
  await expect.poll(() => previewText(instance.app)).toContain("M3-EDITOR-PREVIEW-267");

  await page.getByRole("button", { name: "Close html-1", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Close html-1 and stop it?" })).toBeVisible();
  await page.getByRole("button", { name: "Close and stop", exact: true }).click();
  await expect(page.getByRole("tab", { name: /html-1/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /html-1/ })).toContainText("Stopped");
  await expect.poll(() => instance.platform.proc.identity(shell.pid)).toBeNull();
  await expect
    .poll(() => instance.call("terminal.status", { project }))
    .toMatchObject({ open: false, command: null });
  expect((await state()).tabs).toEqual([]);
  await expect.poll(() => instance.platform.ports.isFree(port)).toBe("free");
});
