import { describe, expect, it } from "vitest";
import { type BootstrapInfo, desktopChannels } from "../shared/desktop-bridge.ts";
import type { LibraryState } from "../shared/library-state.ts";
import { type IpcHost, type IpcSender, registerBridgeHandlers } from "./ipc-handlers.ts";
import type { LibraryController } from "./library-controller.ts";

type Handler = (sender: IpcSender, ...args: unknown[]) => unknown;

function setup() {
  const handlers = new Map<string, Handler>();
  const sent: { channel: string; event: string; state: LibraryState }[] = [];
  const syncHandlers = new Map<string, (sender: IpcSender) => unknown>();
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
    handleSync: (channel, handler) => void syncHandlers.set(channel, handler),
    send: (channel, event, next) => void sent.push({ channel, event, state: next }),
  };
  const info = { platform: "darwin", locale: "en" } as BootstrapInfo;
  registerBridgeHandlers(host, controller, info);
  const call = (sender: IpcSender, method: unknown, param?: unknown) =>
    handlers.get(desktopChannels.call)?.(sender, method, param);
  return {
    call,
    syncHandlers,
    info,
    sent,
    calls,
    push: (next: LibraryState) => push?.(next),
    state,
  };
}

const app: IpcSender = { url: "app://runyard/" };
const outsider: IpcSender = { url: "http://127.0.0.1:7101/" };

describe("registerBridgeHandlers", () => {
  it("来自本应用界面的调用转给控制器", async () => {
    const { call, calls, state } = setup();
    expect(call(app, "library.get")).toBe(state);
    await call(app, "run.start", "a");
    await call(app, "run.stop", "a");
    await call(app, "preview.select", null);
    await call(app, "playground.create", "html");
    expect(calls).toEqual([
      ["start", "a"],
      ["stop", "a"],
      ["select", null],
      ["create", "html"],
    ]);
  });

  it("不在白名单里的方法名一律拒绝", () => {
    const { call, calls } = setup();
    expect(() => call(app, "shell.exec", "ls")).toThrow("unknown method");
    expect(() => call(app, 42)).toThrow("unknown method");
    expect(calls).toEqual([]);
  });

  it("不是本应用界面的发送者一律拒绝，控制器收不到任何调用，也拿不到启动信息", () => {
    const { call, calls, syncHandlers } = setup();
    for (const method of [
      "library.get",
      "run.start",
      "run.stop",
      "preview.select",
      "playground.create",
    ]) {
      expect(() => call(outsider, method, "a")).toThrow("untrusted sender");
    }
    expect(() => syncHandlers.get(desktopChannels.bootstrap)?.(outsider)).toThrow(
      "untrusted sender",
    );
    expect(calls).toEqual([]);
  });

  it("本应用界面同步拿到启动信息", () => {
    const { syncHandlers, info } = setup();
    expect(syncHandlers.get(desktopChannels.bootstrap)?.(app)).toBe(info);
  });

  it("参数不是非空字符串时不调用控制器", async () => {
    const { call, calls } = setup();
    await call(app, "run.start", 42);
    await call(app, "run.stop", "");
    await call(app, "playground.create", { evil: true });
    expect(calls).toEqual([]);
  });

  it("状态变化作为 library.changed 事件推给界面", () => {
    const { sent, push, state } = setup();
    push(state);
    expect(sent).toEqual([{ channel: desktopChannels.event, event: "library.changed", state }]);
  });
});
