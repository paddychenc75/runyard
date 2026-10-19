import { describe, expect, it, vi } from "vitest";
import { type BootstrapInfo, desktopChannels } from "../shared/desktop-bridge.ts";
import type { LibraryState } from "../shared/library-state.ts";
import {
  type IpcHost,
  type IpcSender,
  registerBridgeHandlers,
  requestCommand,
  requestPicker,
} from "./ipc-handlers.ts";
import type { LibraryController } from "./library-controller.ts";
import type { SettingsController } from "./settings-controller.ts";

type Handler = (sender: IpcSender, ...args: unknown[]) => unknown;

function setup() {
  const handlers = new Map<string, Handler>();
  const sent: { channel: string; event: string; state: unknown }[] = [];
  const syncHandlers = new Map<string, (sender: IpcSender) => unknown>();
  const calls: unknown[][] = [];
  let push: ((state: LibraryState) => void) | undefined;
  let pushConsole: ((append: unknown) => void) | undefined;
  const state = {
    locale: "en",
    playgrounds: [],
    tabs: [],
    activeTab: "library",
    templates: [],
    runs: [],
    loaded: true,
    recentTemplates: [],
    closeRequest: null,
    error: null,
    libraryRoot: "~/Runyard",
  } as LibraryState;
  const controller = {
    getState: () => state,
    startRun: async (id: string) => void calls.push(["start", id]),
    stopRun: async (id: string) => void calls.push(["stop", id]),
    stopAll: async () => void calls.push(["stopAll"]),
    adoptRun: async (id: string) => void calls.push(["adopt", id]),
    openProject: async (id: string) => void calls.push(["open", id]),
    selectTab: (id: string) => void calls.push(["select", id]),
    create: async (request: unknown) => {
      calls.push(["create", request]);
      return { ok: true };
    },
    requestCloseTab: async (id: string) => void calls.push(["close", id]),
    confirmClose: async (id: string, again: boolean) => void calls.push(["confirm", id, again]),
    cancelClose: () => void calls.push(["cancel"]),
    consoleLines: (id: string) => [{ seq: 1, entry: { at: 1, kind: "stdout", text: id } }],
    onConsole: (listener: (append: unknown) => void) => {
      pushConsole = listener;
      return () => {};
    },
    runBar: {
      restart: async (id: string) => void calls.push(["restart", id]),
      sendInput: async (id: string, line: string) => void calls.push(["stdin", id, line]),
      setScriptAutoRun: async (id: string, on: boolean) => void calls.push(["autorun", id, on]),
      clearConsole: async (id: string) => void calls.push(["clear", id]),
      reloadPreview: (id: string) => void calls.push(["reload", id]),
      openPreviewInBrowser: (id: string) => void calls.push(["external", id]),
      openPreviewDevTools: (id: string) => void calls.push(["devtools", id]),
      sendRequest: async (id: string, request: unknown) => {
        calls.push(["request", id, request]);
        return { outcome: "failed", reason: "unreachable", durationMs: 0 };
      },
      lastRequest: async (id: string) => void calls.push(["lastRequest", id]),
      openRequestInBrowser: (id: string, path: string) =>
        void calls.push(["openRequest", id, path]),
      setRequestAutoResend: async (id: string, enabled: boolean) =>
        void calls.push(["autoResend", id, enabled]),
    },
    setPreviewBounds: (bounds: unknown) => void calls.push(["bounds", bounds]),
    capturePreview: async () => "data:image/png;base64,AAAA",
    setPreviewVisible: (visible: boolean) => void calls.push(["visible", visible]),
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
    controller,
    syncHandlers,
    info,
    sent,
    calls,
    push: (next: LibraryState) => push?.(next),
    pushConsole: (append: unknown) => pushConsole?.(append),
    state,
  };
}

const app: IpcSender = { url: "app://runyard/" };
const outsider: IpcSender = { url: "http://127.0.0.1:7101/" };

const validCreate = { template: "html", name: "demo-1", note: "", autoClean: null };

it("[DESKTOP-WORKSPACE-71] 刷新桥等待原生加载完成，不在请求送达时提前回复", async () => {
  const { call, controller } = setup();
  let finish = () => {};
  vi.spyOn(controller.runBar, "reloadPreview").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let finished = false;
  const pending = Promise.resolve(
    call({ url: "app://runyard/index.html" }, "preview.reload", "a"),
  ).then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  finish();
  await pending;
  expect(finished).toBe(true);
});

describe("registerBridgeHandlers", () => {
  it("来自本应用界面的调用转给控制器", async () => {
    const { call, calls, state } = setup();
    expect(call(app, "library.get")).toBe(state);
    await call(app, "run.start", "a");
    await call(app, "run.stop", "a");
    await call(app, "run.stopAll");
    await call(app, "run.adopt", "a");
    await call(app, "run.adopt", 42);
    await call(app, "tab.open", "a");
    await call(app, "tab.select", "library");
    await call(app, "playground.create", validCreate);
    await call(app, "tab.close", "a");
    await call(app, "tab.closeConfirm", { id: "a", dontAskAgain: true });
    await call(app, "tab.closeConfirm", { id: "a", dontAskAgain: "yes" });
    await call(app, "tab.closeConfirm", null);
    await call(app, "tab.closeCancel");
    expect(calls).toEqual([
      ["start", "a"],
      ["stop", "a"],
      ["stopAll"],
      ["adopt", "a"],
      ["open", "a"],
      ["select", "library"],
      ["create", validCreate],
      ["close", "a"],
      ["confirm", "a", true],
      ["cancel"],
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
      "tab.open",
      "tab.select",
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
    // 新建的内容形状不对：不调用控制器，界面拿到“失败”而不是异常
    for (const bad of [
      "html",
      { evil: true },
      { ...validCreate, name: "" },
      { ...validCreate, note: 1 },
      { ...validCreate, autoClean: 0 },
      { ...validCreate, autoClean: 1.5 },
      { ...validCreate, autoClean: "30" },
    ]) {
      expect(await call(app, "playground.create", bad)).toEqual({
        ok: false,
        error: { code: "INTERNAL", params: {} },
      });
    }
    expect(calls).toEqual([]);
  });

  it("状态变化作为 library.changed 事件推给界面", () => {
    const { sent, push, state } = setup();
    push(state);
    expect(sent).toEqual([{ channel: desktopChannels.event, event: "library.changed", state }]);
  });

  it("预览通道：占位区的矩形只收形状正确的，截帧和显隐照转", async () => {
    const { call, calls } = setup();
    const area = { x: 1, y: 2, width: 3, height: 4 };
    await call(app, "preview.bounds", area);
    await call(app, "preview.bounds", null);
    await call(app, "preview.bounds", { x: 1, y: 2, width: -3, height: 4 });
    await call(app, "preview.bounds", { x: "1", y: 2, width: 3, height: 4 });
    await call(app, "preview.bounds", { x: Number.NaN, y: 2, width: 3, height: 4 });
    await call(app, "preview.visible", "yes");
    await call(app, "preview.visible", false);
    expect(await call(app, "preview.capture")).toBe("data:image/png;base64,AAAA");
    expect(calls).toEqual([
      ["bounds", area],
      ["bounds", null],
      ["visible", false],
    ]);
  });

  it("运行条通道：重启、输入、开关、清除、刷新、在浏览器中打开、开发者工具都转给控制器，形状不对不转", async () => {
    const { call, calls } = setup();
    await call(app, "run.restart", "a");
    await call(app, "run.stdin", { id: "a", line: "Ada" });
    await call(app, "playground.scriptAutoRun", { id: "a", enabled: false });
    await call(app, "console.clear", "a");
    await call(app, "preview.reload", "a");
    await call(app, "preview.openExternal", "a");
    await call(app, "preview.devtools", "a");
    expect(calls).toEqual([
      ["restart", "a"],
      ["stdin", "a", "Ada"],
      ["autorun", "a", false],
      ["clear", "a"],
      ["reload", "a"],
      ["external", "a"],
      ["devtools", "a"],
    ]);
    calls.length = 0;
    await call(app, "run.restart", "");
    await call(app, "run.stdin", { id: "a", line: 1 });
    await call(app, "playground.scriptAutoRun", { id: "a", enabled: "no" });
    await call(app, "preview.devtools", 7);
    expect(calls).toEqual([]);
  });

  it("[DESKTOP-REQUEST-PANEL-02] 请求面板通道：合格的请求转给控制器；形状不对的（路径不以 / 开头、方法不在名单里、缺字段）不转", async () => {
    const { call, calls } = setup();
    const request = {
      method: "POST",
      path: "/todos",
      headers: [{ name: "a", value: "b" }],
      payload: "x",
    };
    expect(await call(app, "request.send", { id: "a", request })).toMatchObject({
      outcome: "failed",
      reason: "unreachable",
    });
    await call(app, "request.getLast", "a");
    await call(app, "request.openInBrowser", { id: "a", path: "/todos" });
    await call(app, "request.setAutoResend", { id: "a", enabled: false });
    expect(calls).toEqual([
      ["request", "a", request],
      ["lastRequest", "a"],
      ["openRequest", "a", "/todos"],
      ["autoResend", "a", false],
    ]);
    calls.length = 0;
    for (const bad of [
      { id: "a", request: { ...request, path: "http://example.com/" } },
      { id: "a", request: { ...request, path: "example.com/x" } },
      { id: "a", request: { ...request, method: "TRACE" } },
      { id: "a", request: { method: "GET" } },
      { id: "", request },
      { request },
      null,
    ]) {
      expect(await call(app, "request.send", bad)).toMatchObject({
        outcome: "failed",
        reason: "invalid-request",
      });
    }
    await call(app, "request.openInBrowser", { id: "a", path: 7 });
    await call(app, "request.getLast", 5);
    await call(app, "request.setAutoResend", { id: "a", enabled: "no" });
    expect(calls).toEqual([]);
  });

  it("控制台通道：console.get 取已有的行，新输出作为 console.appended 推给界面", async () => {
    const { call, sent, pushConsole } = setup();
    expect(await call(app, "console.get", "a")).toEqual([
      { seq: 1, entry: { at: 1, kind: "stdout", text: "a" } },
    ]);
    expect(await call(app, "console.get", 5)).toEqual([]);
    const append = { playground: "a", lines: [], reset: false };
    pushConsole(append);
    expect(sent).toEqual([
      { channel: desktopChannels.event, event: "console.appended", state: append },
    ]);
  });

  it("[DESKTOP-CREATE-FLOW-03] 菜单的“新建…”经 picker.open 事件通知界面", () => {
    const { sent } = setup();
    requestPicker({
      send: (channel, event, next) => void sent.push({ channel, event, state: next }),
    });
    expect(sent.at(-1)).toEqual({
      channel: desktopChannels.event,
      event: "picker.open",
      state: undefined,
    });
  });
});

describe("应用菜单触发命令", () => {
  it("requestCommand 经 command.run 事件把命令标识符交给界面", () => {
    const sent: { event: string; state: unknown }[] = [];
    requestCommand(
      { send: (_channel, event, state) => void sent.push({ event, state }) },
      "app.settings",
    );
    expect(sent).toEqual([{ event: "command.run", state: { id: "app.settings" } }]);
  });
});

describe("设置通道", () => {
  function withSettings() {
    const { host, handlers, sent } = (() => {
      const handlers = new Map<string, Handler>();
      const sent: { channel: string; event: string; payload: unknown }[] = [];
      const host: IpcHost = {
        handle: (channel, handler) => void handlers.set(channel, handler),
        handleSync: () => {},
        send: (channel, event, payload) => void sent.push({ channel, event, payload }),
      };
      return { host, handlers, sent };
    })();
    const seen: unknown[][] = [];
    let push: ((settings: unknown) => void) | undefined;
    let pushToolchain: (() => void) | undefined;
    const settings = {
      get: async () => ({ theme: "system" }),
      set: async (patch: unknown) => {
        seen.push(["set", patch]);
        return patch;
      },
      editors: async () => [{ id: "cursor", name: "Cursor" }],
      pickLibraryRoot: async () => null,
      revealLibraryRoot: async () => void seen.push(["reveal"]),
      openInEditor: async (id: string) => void seen.push(["editor", id]),
      toolchain: {
        localNetwork: async () => ({ registry: "https://a.example" }),
        check: async (cachedOnly: boolean) => {
          seen.push(["check", cachedOnly]);
          return { tools: [] };
        },
        recheck: async () => ({ tools: [] }),
        pickPath: async (tool: string) => {
          seen.push(["pick", tool]);
          return { status: "cancelled" };
        },
        runInstall: (tool: string) => void seen.push(["install", tool]),
        onChange: (listener: () => void) => {
          pushToolchain = listener;
          return () => {};
        },
      },
      cli: {
        agentSkills: async () => ({ claude: true, agents: false }),
        installAgentSkill: async (target: string) => {
          seen.push(["skill", target]);
          return { claude: true, agents: true };
        },
      },
      onChange: (listener: (settings: unknown) => void) => {
        push = listener;
        return () => {};
      },
    } as unknown as SettingsController;
    const controller = {
      onChange: () => () => {},
      onConsole: () => () => {},
    } as unknown as LibraryController;
    registerBridgeHandlers(
      host,
      controller,
      {} as BootstrapInfo,
      undefined,
      undefined,
      undefined,
      settings,
    );
    const call = (sender: IpcSender, method: string, param?: unknown) =>
      handlers.get(desktopChannels.call)?.(sender, method, param);
    return {
      call,
      seen,
      sent,
      push: (value: unknown) => push?.(value),
      pushToolchain: () => pushToolchain?.(),
    };
  }

  it("设置的方法转给设置控制器；项目 id 不是非空字符串时不动", async () => {
    const { call, seen } = withSettings();
    expect(await call(app, "settings.get")).toEqual({ theme: "system" });
    await call(app, "settings.set", { theme: "dark" });
    expect(await call(app, "settings.editors")).toEqual([{ id: "cursor", name: "Cursor" }]);
    expect(await call(app, "settings.pickLibraryRoot")).toBeNull();
    await call(app, "settings.revealLibraryRoot");
    await call(app, "playground.openInEditor", "demo");
    await call(app, "playground.openInEditor", "");
    expect(seen).toEqual([["set", { theme: "dark" }], ["reveal"], ["editor", "demo"]]);
  });

  it("依赖与网络、运行环境、命令行与智能体的方法：参数形状不对一律不转给设置控制器", async () => {
    const { call, seen } = withSettings();
    expect(await call(app, "settings.localNetwork")).toEqual({ registry: "https://a.example" });
    await call(app, "toolchain.check", { cachedOnly: true });
    await call(app, "toolchain.check", { cachedOnly: "yes" });
    expect(await call(app, "toolchain.pickPath", 7)).toEqual({ status: "failed" });
    await call(app, "toolchain.pickPath", "node");
    await call(app, "toolchain.runInstall", "go");
    await call(app, "toolchain.runInstall", { command: "rm -rf /" });
    expect(await call(app, "agents.install", "codex")).toEqual({ claude: false, agents: false });
    expect(await call(app, "agents.install", "agents")).toEqual({ claude: true, agents: true });
    expect(seen).toEqual([
      ["check", true],
      ["check", false],
      ["pick", "node"],
      ["install", "go"],
      ["skill", "agents"],
    ]);
  });

  it("检测结果变了作为 toolchain.changed 事件推给界面", () => {
    const { pushToolchain, sent } = withSettings();
    pushToolchain();
    expect(sent).toEqual([
      { channel: desktopChannels.event, event: "toolchain.changed", payload: undefined },
    ]);
  });

  it("本应用之外的页面调不动设置", () => {
    const { call, seen } = withSettings();
    expect(() => call(outsider, "settings.set", { theme: "dark" })).toThrow();
    expect(seen).toEqual([]);
  });

  it("设置变化作为 settings.changed 事件推给界面", () => {
    const { push, sent } = withSettings();
    push({ theme: "dark" });
    expect(sent).toEqual([
      { channel: desktopChannels.event, event: "settings.changed", payload: { theme: "dark" } },
    ]);
  });
});
