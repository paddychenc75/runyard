import type { Settings } from "@runyard/protocol";
import { vi } from "vitest";
import type { DesktopBridge, DesktopEvents } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type { LibraryRootChoice } from "../../../shared/settings-bridge.ts";

// 设置页测试共用的现场：有状态的假接口。settings.set 合并后存起来，并像主进程那样发 settings.changed；
// 其余方法由各测试用 on 逐个给出回答，没给的回 undefined。

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

export const sampleSettings: Settings = {
  libraryRoot: "/Users/me/Runyard",
  packageManager: "auto",
  scriptAutoRun: true,
  cliIdleStopMinutes: 30,
  toolPaths: {},
  ports: { min: 7100, max: 7999 },
  urlNewSkipConfirmForBuiltin: false,
  updateCheck: true,
  autoSave: "delay",
  theme: "system",
  network: { noProxyLocal: true },
  confirmCloseRunningTab: true,
};

export const library: LibraryState = {
  locale: "zh-CN",
  libraryRoot: "~/Runyard",
  error: null,
  closeRequest: null,
  templates: [],
  runs: [],
  loaded: true,
  recentTemplates: [],
  tabs: [],
  activeTab: "library",
  playgrounds: [],
};

export interface World {
  bridge: DesktopBridge;
  calls: { method: string; param: unknown }[];
  settings: () => Settings;
  emit: <E extends keyof DesktopEvents>(event: E, payload: DesktopEvents[E]) => void;
}

// 有状态的假接口：settings.set 合并后存起来，并像主进程那样发 settings.changed
export function world(
  options: {
    pick?: LibraryRootChoice | null;
    editors?: string[];
    initial?: Partial<Settings>;
    /** 逐个方法的回答（可以是异步的）；先于下面内置的几个 */
    on?: Record<string, (param: unknown) => unknown>;
  } = {},
): World {
  let settings: Settings = { ...sampleSettings, ...options.initial };
  const calls: World["calls"] = [];
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const call = vi.fn(async (method: string, param?: unknown) => {
    calls.push({ method, param });
    const custom = options.on?.[method];
    if (custom !== undefined) return await custom(param);
    switch (method) {
      case "library.get":
        return library;
      case "console.get":
        return [];
      case "settings.get":
        return settings;
      case "settings.set":
        settings = { ...settings, ...(param as Partial<Settings>) };
        for (const listener of listeners.get("settings.changed") ?? []) listener(settings as never);
        return settings;
      case "settings.editors":
        return (options.editors ?? ["vscode", "cursor"]).map((id) => ({ id, name: id }));
      case "settings.pickLibraryRoot":
        return options.pick ?? null;
      case "settings.localNetwork":
        return {};
      case "toolchain.check":
      case "toolchain.recheck":
        return { tools: [] };
      case "cli.status":
        return { state: "unavailable", version: "0.1.0", onPath: false, pathCommand: "" };
      case "agents.status":
        return { claude: false, agents: false };
      case "supervisor.status":
        return { running: false, cliRuns: 0 };
      default:
        return undefined;
    }
  });
  const bridge = {
    bootstrap: {
      platform: "darwin",
      windowControls: { side: "left", inset: 72 },
      modKey: "meta",
      locale: "zh-CN",
      theme: "system",
      reducedTransparency: false,
      highContrast: false,
    },
    call,
    on: <E extends keyof DesktopEvents>(
      event: E,
      listener: (payload: DesktopEvents[E]) => void,
    ) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (payload: never) => void);
      listeners.set(event, set);
      return () => set.delete(listener as (payload: never) => void);
    },
  } as unknown as DesktopBridge;
  /** 像主进程那样给界面推一个事件 */
  const emit = <E extends keyof DesktopEvents>(event: E, payload: DesktopEvents[E]) => {
    for (const listener of listeners.get(event) ?? []) listener(payload as never);
  };
  return { bridge, calls, settings: () => settings, emit };
}
