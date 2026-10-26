import { join } from "node:path";
import { absPath } from "@runyard/platform";
import { createWithKeyboard, expect, previewText, test } from "./support/fixtures.ts";

// 两个输出必须来自同一次真实外部写入，不能以各自独立的半边测试代替整合链。
test("[DESKTOP-EDITOR-51] 外部命令改写后编辑器和预览均在两秒内显示新内容", async ({ launch }) => {
  const instance = await launch();
  await createWithKeyboard(instance.page);
  await expect.poll(() => previewText(instance.app)).toContain("Clicked 0 times");
  await instance.page.getByRole("treeitem", { name: "index.html", exact: true }).click();
  const editor = instance.page.locator(".monaco-editor .view-lines").first();
  await expect(editor).toContainText("Clicked");
  const marker = "EXTERNAL-EDITOR-PREVIEW-401";
  const html = `<h1>${marker}</h1>`;
  const child = instance.platform.exec.spawn({
    argv: [
      process.execPath,
      "-e",
      "require('node:fs').writeFileSync(process.argv[1],process.argv[2]);process.stdout.write(String(Date.now()))",
      join(instance.library, "html-1", "index.html"),
      html,
    ],
    cwd: absPath(instance.home),
    env: { HOME: instance.home },
    stdin: false,
  });
  const output = (async () => {
    let value = "";
    for await (const chunk of child.stdout) value += String(chunk);
    return value;
  })();
  const [exit, written] = await Promise.all([child.exited, output]);
  expect(exit.exitCode).toBe(0);
  const observed = async () => ({
    editor: (await editor.innerText()).includes(marker),
    preview: (await previewText(instance.app))?.includes(marker) ?? false,
  });
  await expect.poll(observed, { timeout: 2000 }).toEqual({ editor: true, preview: true });
  const elapsed = Date.now() - Number(written);
  expect(elapsed).toBeLessThanOrEqual(2000);
  expect(await instance.platform.proc.identity(child.ref.pid)).toBeNull();
  console.log("外部写入到编辑器和预览均可见", JSON.stringify({ elapsedMs: elapsed }));
  // 再通过真正编辑器保存另一份内容，验证两条入口最终都反映到同一预览。
  await editor.click();
  await instance.page.keyboard.press("Meta+a");
  await instance.page.keyboard.type("<h1>EDITOR-SAVE-401</h1>");
  await instance.page.keyboard.press("Meta+s");
  await expect.poll(() => previewText(instance.app)).toContain("EDITOR-SAVE-401");
});
