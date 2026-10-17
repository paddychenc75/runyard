import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachScreenshot,
  createWithKeyboard,
  expect,
  pressMenuShortcut,
  previewText,
  test,
} from "./support/fixtures.ts";

test("首次启动：空资源库自动弹出选择器，只用键盘选模板、创建、看到预览，再关掉标签页并确认", async ({
  launch,
}, info) => {
  const runyard = await launch();
  const { page, app } = runyard;
  // 空资源库：空状态加自动打开的模板选择器
  await expect(page.getByRole("heading", { name: "No playgrounds yet" })).toBeVisible();
  await createWithKeyboard(page);

  const runBar = page.getByRole("group", { name: "Run bar" });
  await expect(page.getByRole("tab", { name: /html-1/ })).toBeVisible();
  await expect(runBar).toContainText(/Running :\d+/);
  await expect.poll(() => previewText(app)).toContain("html-1");
  expect(readFileSync(join(runyard.library, "html-1", "index.html"), "utf8")).toContain(
    "<title>html-1</title>",
  );
  await attachScreenshot(page, info, "preview-ready");

  // ⌘N 再次打开选择器，Esc 关掉
  await pressMenuShortcut(app, "CmdOrCtrl+N");
  await expect(page.getByRole("dialog", { name: "Choose a template" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 关闭运行中的标签页要确认；确认后停止，资源库里是“已停止”
  await page.getByRole("button", { name: "Close html-1" }).click();
  await expect(page.getByRole("alertdialog", { name: "Close html-1 and stop it?" })).toBeVisible();
  await page.getByRole("button", { name: "Close and stop" }).click();
  await expect(page.getByRole("tab", { name: /html-1/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /html-1/ })).toContainText("Stopped");
  const state = await runyard.call<{ tabs: unknown[] }>("library.get");
  expect(state.tabs).toHaveLength(0);
});

test("React 19 模板：启动进度出现、预览就绪，改 App.tsx 自动保存后预览更新", async ({
  launch,
}, info) => {
  const runyard = await launch();
  const { page, app } = runyard;
  // 启动阶段一闪而过：在页面里挂一个观察器记下进度条目出现过，免得靠轮询赶时间
  await page.evaluate(() => {
    const seen = { value: false };
    (window as unknown as { __sawProgress: typeof seen }).__sawProgress = seen;
    new MutationObserver(() => {
      if (document.body.textContent?.includes("Install dependencies")) seen.value = true;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await createWithKeyboard(page, "react 19");
  await expect(page.getByRole("group", { name: "Run bar" })).toContainText(/Running :\d+/, {
    timeout: 80_000,
  });
  expect(
    await page.evaluate(
      () => (window as unknown as { __sawProgress: { value: boolean } }).__sawProgress.value,
    ),
  ).toBe(true);
  await expect.poll(() => previewText(app)).toContain("React 19 + Vite");
  await attachScreenshot(page, info, "react-ready");

  // 在编辑器里把组件换成一行文字；自动保存后写到磁盘，预览热更新
  await page.getByRole("treeitem", { name: "src" }).click();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("treeitem", { name: "App.tsx" }).click();
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type('export default function App() { return "E2E-REACT-EDITED"; }');
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect
    .poll(() => readFileSync(join(runyard.library, "react19-1", "src", "App.tsx"), "utf8"))
    .toContain("E2E-REACT-EDITED");
  await expect.poll(() => previewText(app), { timeout: 30_000 }).toContain("E2E-REACT-EDITED");
});
