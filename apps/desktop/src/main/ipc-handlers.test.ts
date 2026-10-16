import { describe, expect, it } from "vitest";
import { desktopChannels } from "../shared/desktop-bridge.ts";
import type { LibraryState } from "../shared/library-state.ts";
import { type IpcHost, type IpcSender, registerBridgeHandlers } from "./ipc-handlers.ts";
import type { LibraryController } from "./library-controller.ts";

type Handler = (sender: IpcSender, ...args: unknown[]) => unknown;

function setup() {
  const handlers = new Map<string, Handler>();
  const sent: { channel: string; state: LibraryState }[] = [];
  const calls: unknown[][] = [];
  let push: ((state: LibraryState) => void) | undefined;
  const state = { locale: "en", playgrounds: [], templates: [], error: null } as LibraryState;
  const controller = {
    getState: () => state,
    startRun: async (id: string) => void calls.push(["start", id]),
    stopRun: async (id: string) => void calls.push(["stop", id]),
    select: async (id: string | null) => void calls.push(["select", id]),
    create: async (id: string) => void calls.push(["create", id]),
    onChange: (listener: (next: LibraryState) => void) => {
      push = listener;
      return () => {};
    },
  } as unknown as LibraryController;
  const host: IpcHost = {
    handle: (channel, handler) => void handlers.set(channel, handler),
    send: (channel, next) => void sent.push({ channel, state: next }),
  };
  registerBridgeHandlers(host, controller);
  return { handlers, sent, calls, push: (next: LibraryState) => push?.(next), state };
}

const app: IpcSender = { url: "app://runyard/" };

describe("registerBridgeHandlers", () => {
  it("来自本应用界面的消息转给控制器", async () => {
    const { handlers, calls, state } = setup();
    expect(handlers.get(desktopChannels.getState)?.(app)).toBe(state);
    await handlers.get(desktopChannels.start)?.(app, "a");
    await handlers.get(desktopChannels.stop)?.(app, "a");
    await handlers.get(desktopChannels.select)?.(app, null);
    await handlers.get(desktopChannels.create)?.(app, "html");
    expect(calls).toEqual([
      ["start", "a"],
      ["stop", "a"],
      ["select", null],
      ["create", "html"],
    ]);
  });

  it("不是本应用界面的发送者一律拒绝，控制器收不到任何调用", () => {
    const { handlers, calls } = setup();
    const outsider: IpcSender = { url: "http://127.0.0.1:7101/" };
    for (const channel of Object.values(desktopChannels)) {
      const handler = handlers.get(channel);
      if (handler === undefined) continue;
      expect(() => handler(outsider, "a")).toThrow("untrusted sender");
    }
    expect(calls).toEqual([]);
  });

  it("参数不是非空字符串时不调用控制器", async () => {
    const { handlers, calls } = setup();
    await handlers.get(desktopChannels.start)?.(app, 42);
    await handlers.get(desktopChannels.stop)?.(app, "");
    await handlers.get(desktopChannels.create)?.(app, { evil: true });
    expect(calls).toEqual([]);
  });

  it("状态变化推给界面", () => {
    const { sent, push, state } = setup();
    push(state);
    expect(sent).toEqual([{ channel: desktopChannels.stateChanged, state }]);
  });
});
