import type { Page } from "@playwright/test";
import type * as Monaco from "monaco-editor/editor/editor.api.js";
import { APP_TEXT } from "./fixture.ts";

interface Runtime {
  monaco: typeof Monaco;
}
export async function closeInitialPicker(page: Page) {
  await page.getByRole("dialog").getByRole("combobox").waitFor();
  await page.getByRole("dialog").getByRole("combobox").press("Escape");
}
export async function armTiming(page: Page, phase: string) {
  await page.evaluate((phase) => {
    const state = window as unknown as {
      vueMeasure: {
        phase: string;
        openedAt: number;
        keyAt: number | null;
        domAt: number | null;
        paintedAt: number | null;
      };
    };
    state.vueMeasure = {
      phase,
      openedAt: performance.now(),
      keyAt: null,
      domAt: null,
      paintedAt: null,
    };
    const mark = state.vueMeasure;
    const key = (event: KeyboardEvent) => {
      if (event.key.length === 1 && mark.keyAt === null) mark.keyAt = performance.now();
    };
    window.addEventListener("keydown", key, { capture: true });
    const observer = new MutationObserver(() => {
      if (mark.keyAt === null || mark.domAt !== null) return;
      const widget = document.querySelector(".suggest-widget.visible");
      if (
        !widget ||
        widget.getBoundingClientRect().height === 0 ||
        !widget.textContent?.includes("title") ||
        !widget.textContent?.includes("count")
      )
        return;
      mark.domAt = performance.now();
      observer.disconnect();
      window.removeEventListener("keydown", key, true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          mark.paintedAt = performance.now();
        }),
      );
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }, phase);
}
export async function placeAtTemplate(page: Page) {
  await page.waitForFunction(
    () =>
      Boolean((window as unknown as { __runyardEditorRuntime?: unknown }).__runyardEditorRuntime),
    undefined,
    { polling: "raf" },
  );
  await page.waitForFunction(
    async () => {
      const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
        .__runyardEditorRuntime;
      return runtime.monaco.editor
        .getEditors()
        .some((editor) => editor.getModel()?.uri.path.endsWith("/App.vue"));
    },
    undefined,
    { polling: "raf" },
  );
  await page.evaluate(async () => {
    const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
      .__runyardEditorRuntime;
    const editor = runtime.monaco.editor
      .getEditors()
      .find((item) => item.getModel()?.uri.path.endsWith("/App.vue"));
    editor?.setPosition({ lineNumber: 7, column: 3 });
    editor?.focus();
  });
}
export async function finishTiming(page: Page) {
  await page.waitForFunction(
    () =>
      (window as unknown as { vueMeasure: { paintedAt: number | null } }).vueMeasure.paintedAt !==
      null,
    undefined,
    { polling: "raf", timeout: 30_000 },
  );
  return page.evaluate(() => {
    const data = (
      window as unknown as {
        vueMeasure: { openedAt: number; keyAt: number; domAt: number; paintedAt: number };
      }
    ).vueMeasure;
    return {
      keyToDOM: data.domAt - data.keyAt,
      keyToPaint: data.paintedAt - data.keyAt,
      openToPaint: data.paintedAt - data.openedAt,
    };
  });
}
export async function restoreModel(page: Page) {
  await page.keyboard.press("Escape");
  await page.evaluate(async (text) => {
    const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
      .__runyardEditorRuntime;
    for (const model of runtime.monaco.editor.getModels())
      if (model.uri.path.endsWith("/App.vue")) model.setValue(text);
  }, APP_TEXT);
}

export async function inspectAndCompose(page: Page) {
  await page.keyboard.press("Escape");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "中文", selectionStart: 2, selectionEnd: 2 });
  await cdp.send("Input.insertText", { text: "中文" });
  await cdp.detach();
  const composition = await page.evaluate(async () => {
    const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
      .__runyardEditorRuntime;
    const editor = runtime.monaco.editor.getEditors()[0];
    return { text: editor?.getModel()?.getValue(), position: editor?.getPosition() };
  });
  if (!composition.text?.includes("<Child 中文") || composition.position?.lineNumber !== 7)
    throw new Error("中文组词提交后文本或光标不正确");
  await page.evaluate(async () => {
    const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
      .__runyardEditorRuntime;
    const editor = runtime.monaco.editor.getEditors()[0];
    const model = editor?.getModel();
    if (!editor || !model) throw new Error("Vue 编辑器未打开");
    model.setValue(
      '<script setup lang="ts">\nimport Child from "./Child.vue";\nconst wrong: string = 1;\n</script>\n<template><Child title="hello" :count="1" /></template>',
    );
    editor.setPosition(model.getPositionAt(model.getValue().indexOf('title="hello"') + 1));
    await editor.getAction("editor.action.showHover")?.run();
  });
  await page.locator(".monaco-hover:visible").filter({ hasText: "title: string" }).waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    async () => {
      const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
        .__runyardEditorRuntime;
      return runtime.monaco.editor
        .getModelMarkers({})
        .some((marker) => marker.message.includes("string"));
    },
    undefined,
    { polling: "raf" },
  );
  await page.keyboard.press("F12");
  await page.waitForFunction(
    async () => {
      const runtime = await (window as unknown as { __runyardEditorRuntime: Promise<Runtime> })
        .__runyardEditorRuntime;
      return runtime.monaco.editor
        .getEditors()
        .some((editor) => editor.getModel()?.uri.path.endsWith("/Child.vue"));
    },
    undefined,
    { polling: "raf" },
  );
  return composition;
}
