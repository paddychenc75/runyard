import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { copyVueTypes } from "../src/main/integration/vue-test-support/fixture.ts";

type EditorRuntime = { monaco: typeof Monaco };

import { closePicker, expect, test } from "./support/fixtures.ts";

async function attachScreenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}

for (const theme of ["light", "dark"] as const)
  for (const lang of ["en", "zh-CN"] as const)
    for (const width of [1440, 1100]) {
      test(`Vue 真实补全控件与 TypeScript 对照：${theme}-${lang}-${width}`, async ({
        launch,
      }, info) => {
        const instance = await launch({ theme, lang });
        const { page } = instance;
        await closePicker(page);
        await instance.app.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()[0]?.setContentSize(width, 900),
          width,
        );
        await instance.call("settings.set", { autoSave: "off" });
        await instance.cli("new", "vue3", "vue-complete");
        const folder = join(instance.library, "vue-complete");
        cpSync(
          resolve(import.meta.dirname, "../../../tooling/scripts/vue-smoke-fixture/src/Child.vue"),
          join(folder, "src", "Child.vue"),
        );
        writeFileSync(
          join(folder, "src", "App.vue"),
          '<script setup lang="ts">\nimport Child from "./Child.vue";\n</script>\n\n<template>\n  <Child  />\n</template>\n',
        );
        writeFileSync(
          join(folder, "compare.ts"),
          'const object = { title: "hello", count: 1, tone: "info" };\nobject.\n',
        );
        copyVueTypes(folder, resolve(import.meta.dirname, "../../../tooling"));
        const project = async () =>
          (
            await instance.call<{ playgrounds: { id: string; name: string }[] }>("library.get")
          ).playgrounds.find((entry) => entry.name === "vue-complete")?.id;
        await expect.poll(project).toBeDefined();
        await instance.call("tab.openWithoutRun", await project());
        await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("Child");
        await page.evaluate(async () => {
          const runtime = await (
            window as unknown as { __runyardEditorRuntime: Promise<EditorRuntime> }
          ).__runyardEditorRuntime;
          const editor = runtime.monaco.editor
            .getEditors()
            .find((item) => item.getModel()?.uri.path.endsWith("/App.vue"));
          if (!editor) throw new Error("Vue 编辑器未打开");
          const model = editor.getModel();
          if (!model) throw new Error("模型未打开");
          editor.setPosition(model.getPositionAt(model.getValue().indexOf("<Child  />") + 7));
          editor.focus();
          editor.trigger("test", "editor.action.triggerSuggest", {});
        });
        const suggestions = page.locator(".suggest-widget.visible");
        await expect(suggestions).toContainText(":title");
        await expect(suggestions).toContainText(":count");
        await attachScreenshot(page, info, `vue-completion-${theme}-${lang}-${width}`);
        // 通过用户可点的候选插入，不能只验证后台列表里有字符串。
        await suggestions.locator(".monaco-list-row", { hasText: ":title" }).first().click();
        await page.keyboard.press("Enter");
        await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(":title");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Meta+s");
        await page.getByRole("treeitem", { name: "compare.ts", exact: true }).click();
        await page.evaluate(async () => {
          const runtime = await (
            window as unknown as { __runyardEditorRuntime: Promise<EditorRuntime> }
          ).__runyardEditorRuntime;
          const editor = runtime.monaco.editor
            .getEditors()
            .find((item) => item.getModel()?.uri.path.endsWith("/compare.ts"));
          if (!editor) throw new Error("TS 编辑器未打开");
          editor.setPosition({ lineNumber: 2, column: 8 });
          editor.focus();
          editor.trigger("test", "editor.action.triggerSuggest", {});
        });
        await expect(suggestions).toContainText("title");
        await attachScreenshot(page, info, `typescript-completion-${theme}-${lang}-${width}`);
        await page.keyboard.press("Escape");
        // 测试中的插入由会话保留，正常保存后退出，避免退出询问留住本测试的应用。
        await page.keyboard.press("Meta+s");
      });
    }
