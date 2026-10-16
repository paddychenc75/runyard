import { describe, expect, it } from "vitest";
import { type BootstrapInfo, desktopChannels } from "../shared/desktop-bridge.ts";
import type { LibraryState } from "../shared/library-state.ts";
import {
  applyBootstrap,
  applyBootstrapWhenReady,
  createBridge,
  type IpcRendererLike,
} from "./create-bridge.ts";

const info = { platform: "darwin", theme: "system", locale: "zh-CN" } as BootstrapInfo;

function fakeIpc() {
  const invoked: unknown[][] = [];
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  const ipc: IpcRendererLike = {
    invoke: async (channel, ...args) => {
      invoked.push([channel, ...args]);
      return { fake: true };
    },
    sendSync: (channel) => (channel === desktopChannels.bootstrap ? info : null),
    on: (channel, listener) => void listeners.set(channel, listener),
    removeListener: (channel) => void listeners.delete(channel),
  };
  return { ipc, invoked, listeners };
}

describe("createBridge", () => {
  it("同步带着启动信息；call 只走一个通道，带方法名和一个参数", async () => {
    const { ipc, invoked } = fakeIpc();
    const bridge = createBridge(ipc);
    expect(bridge.bootstrap).toBe(info);
    await bridge.call("run.start", "a");
    expect(await bridge.call("library.get")).toEqual({ fake: true });
    expect(invoked).toEqual([
      [desktopChannels.call, "run.start", "a"],
      [desktopChannels.call, "library.get", undefined],
    ]);
  });

  it("白名单外的方法名与事件名被拒绝，不发出任何消息", async () => {
    const { ipc, invoked } = fakeIpc();
    const bridge = createBridge(ipc) as unknown as {
      call(method: string): Promise<unknown>;
      on(event: string, listener: () => void): unknown;
    };
    await expect(bridge.call("shell.exec")).rejects.toThrow("unknown method");
    expect(() => bridge.on("anything", () => {})).toThrow("unknown event");
    expect(invoked).toEqual([]);
  });

  it("订阅只收到负载，不暴露 Electron 的事件对象；取消后不再监听", () => {
    const { ipc, listeners } = fakeIpc();
    const bridge = createBridge(ipc);
    const received: LibraryState[] = [];
    const off = bridge.on("library.changed", (state) => received.push(state));
    const state = { locale: "en" } as LibraryState;
    listeners.get(desktopChannels.event)?.({ sender: "secret" }, "library.changed", state);
    listeners.get(desktopChannels.event)?.({ sender: "secret" }, "other", state);
    expect(received).toEqual([state]);
    off();
    expect(listeners.has(desktopChannels.event)).toBe(false);
  });
});

describe("applyBootstrap", () => {
  it("把平台、主题、语言写到根元素上", () => {
    const root = { dataset: {} as Record<string, string | undefined>, lang: "" };
    applyBootstrap(root, info);
    expect(root.dataset.platform).toBe("darwin");
    expect(root.dataset.theme).toBe("system");
    expect(root.lang).toBe("zh-CN");
  });
});

describe("applyBootstrapWhenReady", () => {
  it("根元素还没建好时先等，建好后写入；已建好时立即写入且不再监听", () => {
    const root = { dataset: {} as Record<string, string | undefined>, lang: "" };
    const doc = { documentElement: null as typeof root | null };
    let notify: () => boolean = () => false;
    applyBootstrapWhenReady(doc, info, (attempt) => (notify = attempt));
    expect(root.lang).toBe("");
    expect(notify()).toBe(false);
    doc.documentElement = root;
    expect(notify()).toBe(true);
    expect(root.dataset.platform).toBe("darwin");

    let watched = false;
    applyBootstrapWhenReady(doc, info, () => (watched = true));
    expect(watched).toBe(false);
  });
});
