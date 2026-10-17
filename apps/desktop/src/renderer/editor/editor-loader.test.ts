// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// 加载器按“样式、脚本、读全局运行时”的顺序做，重复调用共用一次加载，失败后可重试。

async function freshLoader() {
  vi.resetModules();
  document.head.replaceChildren();
  Reflect.deleteProperty(window, "__runyardEditorRuntime");
  return await import("./editor-loader.ts");
}

describe("loadEditorRuntime", () => {
  beforeEach(() => {
    document.head.replaceChildren();
  });

  it("从 app://runyard/ 加样式和脚本，脚本载入后交出运行时，重复调用只加载一次", async () => {
    const { loadEditorRuntime } = await freshLoader();
    const runtime = { themes: { light: "l", dark: "d" } };
    const first = loadEditorRuntime(document);
    const second = loadEditorRuntime(document);
    const script = document.head.querySelector("script");
    expect(script?.src).toBe("app://runyard/editor/editor.js");
    expect(document.head.querySelector("link")?.href).toBe("app://runyard/editor/editor.css");
    Object.assign(window, { __runyardEditorRuntime: Promise.resolve(runtime) });
    script?.dispatchEvent(new Event("load"));
    expect(await first).toBe(runtime);
    expect(await second).toBe(runtime);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("中文界面先载入 Monaco 的中文文字包，等它载完才载入编辑器脚本；英文界面不载入文字包", async () => {
    const zh = await freshLoader();
    const pending = zh.loadEditorRuntime(document, "zh-CN");
    pending.catch(() => {});
    const first = document.head.querySelector("script");
    expect(first?.src).toBe("app://runyard/editor/nls-zh-cn.js");
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    first?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    const scripts = [...document.head.querySelectorAll("script")].map((script) => script.src);
    expect(scripts).toEqual([
      "app://runyard/editor/nls-zh-cn.js",
      "app://runyard/editor/editor.js",
    ]);

    const en = await freshLoader();
    en.loadEditorRuntime(document, "en").catch(() => {});
    expect(document.head.querySelector("script")?.src).toBe("app://runyard/editor/editor.js");
  });

  it("脚本加载失败时报错，下一次调用重新尝试", async () => {
    const { loadEditorRuntime } = await freshLoader();
    const failing = loadEditorRuntime(document);
    document.head.querySelector("script")?.dispatchEvent(new Event("error"));
    await expect(failing).rejects.toThrow("failed to load");
    const retry = loadEditorRuntime(document);
    expect(document.head.querySelectorAll("script")).toHaveLength(2);
    retry.catch(() => {});
  });

  it("脚本载入了却没有交出运行时，也是错误", async () => {
    const { loadEditorRuntime } = await freshLoader();
    const pending = loadEditorRuntime(document);
    document.head.querySelector("script")?.dispatchEvent(new Event("load"));
    await expect(pending).rejects.toThrow("did not provide");
  });
});

describe("preloadEditorWhenIdle", () => {
  it("在空闲回调里才开始加载，不在调用的当下", async () => {
    const { preloadEditorWhenIdle } = await freshLoader();
    let idle: (() => void) | undefined;
    const fakeWindow = {
      requestIdleCallback: (callback: () => void) => {
        idle = callback;
        return 1;
      },
    } as unknown as Window;
    preloadEditorWhenIdle(fakeWindow, document);
    expect(document.head.querySelector("script")).toBeNull();
    idle?.();
    expect(document.head.querySelector("script")).not.toBeNull();
  });
});
