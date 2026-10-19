import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { PreviewReload } from "./preview-reload.ts";

function setup() {
  const events = new EventEmitter();
  const contents = Object.assign(events, { reload: vi.fn() });
  const reload = new PreviewReload(contents as unknown as WebContents);
  return { events, contents, reload };
}

describe("预览手动刷新生命周期", () => {
  it("[DESKTOP-WORKSPACE-71] reload 同步发出加载和停止事件时监听已安装", async () => {
    const { reload, events, contents } = setup();
    contents.reload.mockImplementation(() => {
      events.emit("did-start-loading");
      events.emit("did-stop-loading");
    });
    await reload.start();
    expect(events.eventNames()).toEqual([]);
    await reload.start();
    expect(contents.reload).toHaveBeenCalledTimes(2);
  });

  it("[DESKTOP-WORKSPACE-71] 发出 reload 不算完成，等真实加载结束，重复调用只刷新一次", async () => {
    const { reload, events, contents } = setup();
    const done = vi.fn();
    const promise = reload.start().then(done);
    void reload.start();
    expect(contents.reload).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    events.emit("did-stop-loading");
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    events.emit("did-start-loading");
    events.emit("did-stop-loading");
    await promise;
    expect(done).toHaveBeenCalledTimes(1);
    expect(events.eventNames()).toEqual([]);
  });

  it("[DESKTOP-WORKSPACE-71] 子框架失败不结束主页面刷新，主框架失败结束且可再次刷新", async () => {
    const { reload, events, contents } = setup();
    const done = vi.fn();
    const promise = reload.start().then(done);
    events.emit("did-fail-load", {}, -2, "failed", "url", false);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    events.emit("did-fail-load", {}, -2, "failed", "url", true);
    await promise;
    const next = reload.start();
    expect(contents.reload).toHaveBeenCalledTimes(2);
    reload.dispose();
    await next;
    expect(events.eventNames()).toEqual([]);
  });

  it.each(["destroyed", "render-process-gone"])(
    "[DESKTOP-WORKSPACE-71] %s 结束等待并移除监听",
    async (event) => {
      const { reload, events } = setup();
      const promise = reload.start();
      events.emit(event);
      await promise;
      expect(events.eventNames()).toEqual([]);
    },
  );

  it("[DESKTOP-WORKSPACE-71] 同步调用失败也恢复，销毁旧预览不影响新预览", async () => {
    const old = setup();
    old.contents.reload.mockImplementationOnce(() => {
      throw new Error("closed");
    });
    await old.reload.start();
    expect(old.events.eventNames()).toEqual([]);
    const next = setup();
    const done = vi.fn();
    const promise = next.reload.start().then(done);
    old.reload.dispose();
    old.events.emit("did-stop-loading");
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    next.reload.dispose();
    await promise;
  });
});
