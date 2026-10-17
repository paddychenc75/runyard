// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { runningSnapshot } from "../features/terminal/test-support/fake-bridge.ts";
import { FakeTerminal } from "../features/terminal/test-support/fake-xterm.ts";
import { CommandContext, CommandHost } from "../shared/command-host.tsx";
import { onEditorFocusRequest } from "../shared/editor-focus.ts";
import { AppFrame } from "./AppFrame.tsx";
import { ConsolePanel } from "./ConsolePanel.tsx";
import { sampleTab } from "./sample-tab.ts";

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
vi.setConfig({ testTimeout: 20_000 });
const SLOW = { timeout: 8000 };

beforeEach(() => FakeTerminal.reset());
afterEach(cleanup);

const tab = sampleTab({ id: "a", name: "react-counter" });
const base: LibraryState = {
  locale: "zh-CN",
  libraryRoot: "~/Runyard",
  error: null,
  closeRequest: null,
  templates: [],
  runs: [],
  loaded: true,
  recentTemplates: [],
  tabs: [tab],
  activeTab: "a",
  playgrounds: [],
};

function setup(initial: LibraryState = base) {
  const listeners = new Map<string, ((payload: never) => void)[]>();
  const calls: { method: string; param: unknown }[] = [];
  const call = vi.fn(async (method: string, param?: unknown) => {
    calls.push({ method, param });
    if (method === "library.get") return initial;
    if (method === "console.get") return [];
    if (method === "terminal.open" || method === "terminal.reopen") return runningSnapshot();
    if (method === "terminal.busy") return [];
    return undefined;
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
    on: (name: string, listener: (payload: never) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return () =>
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((l) => l !== listener),
        );
    },
  } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
  const emit = (name: string, payload: unknown) => {
    for (const listener of listeners.get(name) ?? []) (listener as (p: unknown) => void)(payload);
  };
  return {
    call,
    calls,
    emit,
    named: (m: string) => calls.filter((c) => c.method === m).map((c) => c.param),
  };
}

const segment = (name: string) => screen.findByRole("button", { name, pressed: undefined }, SLOW);

describe("底部面板：输出 / 终端", () => {
  it("[DESKTOP-TERMINAL-01] 打开标签页时显示“输出”，不创建终端；第一次点“终端”才创建，大小取自终端，只创建一次", async () => {
    const user = userEvent.setup();
    const t = setup();
    const output = await segment("输出");
    expect(output.getAttribute("aria-pressed")).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.named("terminal.open")).toEqual([]);
    expect(FakeTerminal.instances).toHaveLength(0);
    expect(screen.getByRole("button", { name: "清除" })).toBeTruthy();
    await user.click(await segment("终端"));
    await waitFor(() =>
      expect(t.named("terminal.open")).toEqual([{ project: "a", cols: 100, rows: 30 }]),
    );
    expect((await segment("终端")).getAttribute("aria-pressed")).toBe("true");
    // “清除”只在“输出”下出现
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });

  it("[DESKTOP-TERMINAL-03] 切回“输出”只是断开（detach），再切到“终端”接回同一个终端（open 是“有就接上”）", async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(await segment("终端"));
    await waitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    await user.click(await segment("输出"));
    await waitFor(() => expect(t.named("terminal.detach")).toEqual([{ project: "a" }]));
    expect(t.named("terminal.reopen")).toEqual([]);
    await user.click(await segment("终端"));
    await waitFor(() => expect(t.named("terminal.open")).toHaveLength(2));
  });

  it("[DESKTOP-TERMINAL-05] ⌃` 在输出下：切到终端并把焦点放进去；焦点在终端里再按：焦点还给编辑器，仍显示“终端”", async () => {
    const t = setup();
    await segment("输出");
    const editorFocus = vi.fn();
    const stop = onEditorFocusRequest(editorFocus);
    fireEvent.keyDown(window, { key: "`", ctrlKey: true });
    await waitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    await waitFor(() => expect(FakeTerminal.last().focused).toBeGreaterThan(0));
    expect((await segment("终端")).getAttribute("aria-pressed")).toBe("true");
    // 焦点在终端里
    const host = document.querySelector<HTMLElement>("[data-terminal-host]") as HTMLElement;
    host.tabIndex = 0;
    host.focus();
    fireEvent.keyDown(window, { key: "`", ctrlKey: true });
    expect(editorFocus).toHaveBeenCalledTimes(1);
    expect((await segment("终端")).getAttribute("aria-pressed")).toBe("true");
    // 焦点不在终端里再按：回到终端
    host.blur();
    const focused = FakeTerminal.last().focused;
    fireEvent.keyDown(window, { key: "`", ctrlKey: true });
    expect(FakeTerminal.last().focused).toBeGreaterThan(focused);
    stop();
  });

  it("[DESKTOP-TERMINAL-06] 标签页关了再打开（或重新打开应用恢复标签页）：底部面板是“输出”，没有自动创建终端", async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(await segment("终端"));
    await waitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    t.emit("library.changed", { ...base, tabs: [], activeTab: "library" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "输出" })).toBeNull());
    t.emit("library.changed", base);
    expect((await segment("输出")).getAttribute("aria-pressed")).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.named("terminal.open")).toHaveLength(1);
  });

  it("[DESKTOP-EDITOR-61] 命令面板的“显示终端”切到终端并把焦点放进去，“显示输出”切回输出；面板不在时这两条命令不可用", async () => {
    const host = new CommandHost();
    const calls: string[] = [];
    const bridge = {
      bootstrap: { platform: "darwin", modKey: "meta", locale: "zh-CN", theme: "light" },
      call: async (method: string) => {
        calls.push(method);
        return method === "terminal.open" ? runningSnapshot() : [];
      },
      on: () => () => {},
    } as unknown as DesktopBridge;
    const { unmount } = render(
      <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
        <CommandContext.Provider value={host}>
          <ConsolePanel bridge={bridge} tab={tab} />
        </CommandContext.Provider>
      </I18nProvider>,
    );
    expect(host.available()).toEqual(
      expect.arrayContaining(["app.showTerminal", "app.showOutput"]),
    );
    act(() => void host.run("app.showTerminal"));
    await waitFor(() => expect(calls).toContain("terminal.open"));
    await waitFor(() => expect(FakeTerminal.last().focused).toBeGreaterThan(0));
    expect((await segment("终端")).getAttribute("aria-pressed")).toBe("true");
    act(() => void host.run("app.showOutput"));
    await waitFor(async () =>
      expect((await segment("输出")).getAttribute("aria-pressed")).toBe("true"),
    );
    unmount();
    expect(host.available()).toEqual([]);
  });
});
