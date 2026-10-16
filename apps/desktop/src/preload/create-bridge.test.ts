import { describe, expect, it } from "vitest";
import { desktopChannels } from "../shared/desktop-bridge.ts";
import type { LibraryState } from "../shared/library-state.ts";
import { createBridge, type IpcRendererLike } from "./create-bridge.ts";

function fakeIpc() {
  const invoked: unknown[][] = [];
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  const ipc: IpcRendererLike = {
    invoke: async (channel, ...args) => {
      invoked.push([channel, ...args]);
      return { fake: true };
    },
    on: (channel, listener) => void listeners.set(channel, listener),
    removeListener: (channel) => void listeners.delete(channel),
  };
  return { ipc, invoked, listeners };
}

describe("createBridge", () => {
  it("每个动作只发对应的通道和一个参数", async () => {
    const { ipc, invoked } = fakeIpc();
    const bridge = createBridge(ipc);
    await bridge.start("a");
    await bridge.stop("a");
    await bridge.select(null);
    await bridge.create("html");
    expect(await bridge.getState()).toEqual({ fake: true });
    expect(invoked).toEqual([
      [desktopChannels.start, "a"],
      [desktopChannels.stop, "a"],
      [desktopChannels.select, null],
      [desktopChannels.create, "html"],
      [desktopChannels.getState],
    ]);
  });

  it("订阅只收到状态，不暴露 Electron 的事件对象；取消后不再监听", () => {
    const { ipc, listeners } = fakeIpc();
    const bridge = createBridge(ipc);
    const received: LibraryState[] = [];
    const off = bridge.onState((state) => received.push(state));
    const state = { locale: "en" } as LibraryState;
    listeners.get(desktopChannels.stateChanged)?.({ sender: "secret" }, state);
    expect(received).toEqual([state]);
    off();
    expect(listeners.has(desktopChannels.stateChanged)).toBe(false);
  });
});
