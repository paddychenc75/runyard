import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { copyVueTypes } from "../src/main/integration/vue-test-support/fixture.ts";
import { expect, test } from "./support/fixtures.ts";

type Runtime = { monaco: typeof Monaco };
async function action(page: Page, file: string, needle: string, extra: number, name: string) {
  await page.evaluate(
    async ({ file, needle, extra, name }) => {
      const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
        .__runyardEditorRuntime;
      const editor = runtime.monaco.editor
        .getEditors()
        .find((entry) => entry.getModel()?.uri.path.endsWith(`/${file}`));
      const model = editor?.getModel();
      if (!editor || !model) throw new Error("编辑器未打开");
      editor.setPosition(model.getPositionAt(model.getValue().indexOf(needle) + extra));
      editor.focus();
      if (name !== "editor.action.revealDefinition") await editor.getAction(name)?.run();
    },
    { file, needle, extra, name },
  );
  if (name === "editor.action.revealDefinition") await page.keyboard.press("F12");
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await expect(page.locator(".monaco-hover:visible")).toHaveCSS("opacity", "1");
  await page.screenshot({ path, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}
async function shown(page: Page) {
  return page.evaluate(async () => {
    const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
      .__runyardEditorRuntime;
    const editor = runtime.monaco.editor.getEditors()[0];
    return { path: editor?.getModel()?.uri.path, line: editor?.getPosition()?.lineNumber };
  });
}
for (const theme of ["light", "dark"] as const)
  for (const lang of ["en", "zh-CN"] as const)
    for (const width of [1440, 1100]) {
      test(`Vue 悬停、跳转、错误波浪线与TS控件对照：${theme}-${lang}-${width}`, async ({
        launch,
      }, info) => {
        const instance = await launch({ theme, lang });
        const { page } = instance;
        await expect(page.getByRole("dialog").getByRole("combobox")).toBeFocused();
        await page.getByRole("dialog").getByRole("combobox").press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await instance.app.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()[0]?.setContentSize(width, 900),
          width,
        );
        await instance.call("settings.set", { autoSave: "off" });
        await instance.cli("new", "vue3", "vue-inspect");
        const folder = join(instance.library, "vue-inspect");
        cpSync(
          resolve(import.meta.dirname, "../../../tooling/scripts/vue-smoke-fixture/src/Child.vue"),
          join(folder, "src", "Child.vue"),
        );
        writeFileSync(
          join(folder, "src", "App.vue"),
          '<script setup lang="ts">\nimport Child from "./Child.vue";\nconst s: string = 1;\n</script>\n<template>\n  <Child title="hello" :count="\'x\'" />\n  <Child :count="1" />\n  {{ missingVar }}\n</template>\n',
        );
        writeFileSync(
          join(folder, "compare.ts"),
          'const object = { title: "hello" };\nconst wrong: string = 1;\nobject.title;\n',
        );
        copyVueTypes(folder, resolve(import.meta.dirname, "../../../tooling"));
        const project = async () =>
          (
            await instance.call<{ playgrounds: { id: string; name: string }[] }>("library.get")
          ).playgrounds.find((entry) => entry.name === "vue-inspect")?.id;
        await expect.poll(project).toBeDefined();
        await instance.call("tab.openWithoutRun", await project());
        await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("Child");
        await expect
          .poll(() =>
            page.evaluate(async () => {
              const runtime = await (
                window as unknown as { __runyardEditorRuntime: Promise<Runtime> }
              ).__runyardEditorRuntime;
              const model = runtime.monaco.editor
                .getModels()
                .find((entry) => entry.uri.path.endsWith("/App.vue"));
              return model
                ? runtime.monaco.editor
                    .getModelMarkers({ resource: model.uri })
                    .filter((marker) => marker.severity === runtime.monaco.MarkerSeverity.Error)
                    .length
                : 0;
            }),
          )
          .toBeGreaterThanOrEqual(4);
        await action(page, "App.vue", 'title="hello"', 1, "editor.action.showHover");
        await expect(page.locator(".monaco-hover:visible")).toContainText("title: string");
        await screenshot(page, info, `vue-inspection-${theme}-${lang}-${width}`);
        await page.keyboard.press("Escape");
        await action(page, "App.vue", "<Child", 2, "editor.action.revealDefinition");
        await expect.poll(async () => (await shown(page)).path).toBe("/src/Child.vue");
        await page.getByRole("treeitem", { name: "App.vue", exact: true }).click();
        await action(page, "App.vue", 'title="hello"', 1, "editor.action.revealDefinition");
        await expect.poll(() => shown(page)).toEqual({ path: "/src/Child.vue", line: 3 });
        await page.getByRole("treeitem", { name: "compare.ts", exact: true }).click();
        await action(page, "compare.ts", "object.title", 8, "editor.action.showHover");
        await expect(page.locator(".monaco-hover:visible")).toContainText("title: string");
        await screenshot(page, info, `typescript-inspection-${theme}-${lang}-${width}`);
        await page.keyboard.press("Escape");
      });
    }
