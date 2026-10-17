// @vitest-environment jsdom

import type { Settings } from "@runyard/protocol";
import { cleanup, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge, DesktopEvents } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type { LibraryRootChoice } from "../../../shared/settings-bridge.ts";
import { App } from "../App.tsx";
import { useAutoSaveReader } from "./use-autosave-reader.ts";

afterEach(cleanup);

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

const sampleSettings: Settings = {
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
  confirmCloseRunningTab: true,
};

const library: LibraryState = {
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

interface World {
  bridge: DesktopBridge;
  calls: { method: string; param: unknown }[];
  settings: () => Settings;
}

// 有状态的假接口：settings.set 合并后存起来，并像主进程那样发 settings.changed
function world(
  options: {
    pick?: LibraryRootChoice | null;
    editors?: string[];
    initial?: Partial<Settings>;
  } = {},
): World {
  let settings: Settings = { ...sampleSettings, ...options.initial };
  const calls: World["calls"] = [];
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const call = vi.fn(async (method: string, param?: unknown) => {
    calls.push({ method, param });
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
  return { bridge, calls, settings: () => settings };
}

async function openSettings(w: World) {
  const user = userEvent.setup();
  render(<App bridge={w.bridge} />);
  await user.click(await screen.findByRole("button", { name: "设置" }));
  await screen.findByRole("heading", { name: "通用" });
  return user;
}

const sets = (w: World) => w.calls.filter((c) => c.method === "settings.set").map((c) => c.param);

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("设置页", () => {
  it("[DESKTOP-SETTINGS-01] 点侧栏“设置”在主窗口里打开设置页，没有顶栏，五组的标题依次出现", async () => {
    const w = world();
    render(<App bridge={w.bridge} />);
    expect(await screen.findByRole("tablist")).toBeTruthy();
    await userEvent.setup().click(await screen.findByRole("button", { name: "设置" }));
    await screen.findByRole("heading", { name: "通用" });
    expect(screen.queryByRole("tablist")).toBeNull();
    const page = screen.getByRole("region", { name: "设置" });
    const titles = within(page)
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["通用", "编辑与运行", "依赖与网络", "运行环境", "命令行与智能体"]);
    expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-03] 在“语言”里点 English，不重启，侧栏和设置页的文字立即变成英文", async () => {
    const w = world();
    const user = await openSettings(w);
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByRole("heading", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(within(screen.getByRole("navigation")).getByText("Library")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(sets(w)).toEqual([{ language: "en" }]);
  });

  it("[DESKTOP-SETTINGS-04] 选“深色”界面立即变深色；改回“跟随系统”后又交给系统", async () => {
    const w = world();
    const user = await openSettings(w);
    await user.click(screen.getByRole("button", { name: "深色" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    await user.click(screen.getByRole("button", { name: "跟随系统" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("system"));
    expect(sets(w)).toEqual([{ theme: "dark" }, { theme: "system" }]);
  });

  it("[DESKTOP-SETTINGS-05] 资源库选在“文档”里先弹出隐私警告，点取消位置不变", async () => {
    const w = world({
      pick: {
        path: "/Users/me/Documents/Runyard",
        display: "~/Documents/Runyard",
        protectedFolder: true,
      },
    });
    const user = await openSettings(w);
    await user.click(screen.getByRole("button", { name: "更改…" }));
    const warning = await screen.findByRole("alertdialog");
    expect(within(warning).getByText(/隐私权限提示/)).toBeTruthy();
    await user.click(within(warning).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(sets(w)).toEqual([]);
  });

  it("[DESKTOP-SETTINGS-06] 换资源库位置：确认框写明旧位置的项目留在原处，确认后才写进设置", async () => {
    const w = world({
      pick: { path: "/Users/me/Work/lib", display: "~/Work/lib", protectedFolder: false },
    });
    const user = await openSettings(w);
    await user.click(screen.getByRole("button", { name: "更改…" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/旧位置里的项目留在原处/)).toBeTruthy();
    expect(sets(w)).toEqual([]);
    await user.click(within(confirm).getByRole("button", { name: "更改位置" }));
    await waitFor(() => expect(sets(w)).toEqual([{ libraryRoot: "/Users/me/Work/lib" }]));
  });

  it("[DESKTOP-SETTINGS-07] 外部编辑器下拉列出本机找到的编辑器，选 Cursor 后写进设置", async () => {
    const w = world({ editors: ["vscode", "cursor"] });
    const user = await openSettings(w);
    await user.click(await screen.findByRole("button", { name: "外部编辑器" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["VS Code", "Cursor"]);
    await user.click(items[1] as HTMLElement);
    await waitFor(() => expect(sets(w)).toEqual([{ externalEditor: "cursor" }]));
  });

  it("[DESKTOP-SETTINGS-08] “不再提示”之后开关是关的；打开它写进设置，关闭确认重新出现", async () => {
    const w = world({ initial: { confirmCloseRunningTab: false } });
    const user = await openSettings(w);
    const toggle = screen.getByRole("switch", { name: "关闭运行中的标签页前询问" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await waitFor(() => expect(w.settings().confirmCloseRunningTab).toBe(true));
    expect(sets(w)).toEqual([{ confirmCloseRunningTab: true }]);
  });

  it("[DESKTOP-SETTINGS-11] 自动保存改为“失去焦点时”：设置页选中这一档并写进设置", async () => {
    const w = world();
    const user = await openSettings(w);
    const blur = screen.getByRole("button", { name: "失去焦点时" });
    const first = screen.getByRole("button", { name: "延迟 1 秒后" });
    await waitFor(() => expect(first.getAttribute("aria-pressed")).toBe("true"));
    await user.click(blur);
    await waitFor(() => expect(blur.getAttribute("aria-pressed")).toBe("true"));
    expect(sets(w)).toEqual([{ autoSave: "blur" }]);
  });

  it("[DESKTOP-SETTINGS-11] 编辑器拿到的读档位函数身份不变，每次调用读最新的设置；没读到设置时是第一档", () => {
    const { result, rerender } = renderHook(({ s }) => useAutoSaveReader(s), {
      initialProps: { s: null as Settings | null },
    });
    const reader = result.current;
    expect(reader()).toBe("delay");
    rerender({ s: { ...sampleSettings, autoSave: "blur" } });
    expect(result.current).toBe(reader);
    expect(reader()).toBe("blur");
    rerender({ s: { ...sampleSettings, autoSave: "off" } });
    expect(reader()).toBe("off");
  });

  it("[DESKTOP-SETTINGS-25] 第一次打开设置页：内置模板免确认是关的，打开它写进设置", async () => {
    const w = world();
    const user = await openSettings(w);
    const toggle = screen.getByRole("switch", { name: "来自链接的新建请求：内置模板免确认" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await waitFor(() => expect(sets(w)).toEqual([{ urlNewSkipConfirmForBuiltin: true }]));
  });

  it("依赖与网络、运行环境、命令行与智能体这几组没做的部分写明随哪个 issue 提供", async () => {
    await openSettings(world());
    expect(screen.getAllByText(/#189/)).toHaveLength(2);
    expect(screen.getByText(/#195/)).toBeTruthy();
  });
});
