// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";
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
// 慢机器（windows-2025）上整个外壳加弹窗要几秒才画出来：等待条件的期限放宽（用例的时限不变）
configure({ asyncUtilTimeout: 8000 });
afterEach(cleanup);

const state: LibraryState = {
  locale: "zh-CN",
  libraryRoot: "~/Runyard",
  error: null,
  closeRequest: null,
  templates: [],
  runs: [],
  loaded: true,
  recentTemplates: [],
  tabs: [sampleTab({ id: "a", name: "demo" }), sampleTab({ id: "b", name: "api", active: false })],
  activeTab: "a",
  playgrounds: [],
};

function setup(busy: { project: string; command: string }[]) {
  const listeners = new Map<string, ((payload: never) => void)[]>();
  const call = vi.fn(async (method: string, _param?: unknown) =>
    method === "library.get"
      ? state
      : method === "console.get"
        ? []
        : method === "terminal.busy"
          ? busy
          : undefined,
  );
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
      return () => {};
    },
  } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
  const quit = async () => {
    await waitFor(() => expect(listeners.get("app.quitRequested")?.length).toBeGreaterThan(0));
    for (const listener of listeners.get("app.quitRequested") ?? [])
      (listener as (p: unknown) => void)({ id: 7 });
  };
  const replies = () =>
    call.mock.calls.filter(([method]) => method === "app.quitReply").map(([, param]) => param);
  return { quit, replies };
}

describe("⌘Q 时终端里有命令在运行", () => {
  it("[DESKTOP-TERMINAL-30] 弹一个确认，只列出有命令在运行的项目和命令；选“取消”不退出，选“退出”才放行", async () => {
    const user = userEvent.setup();
    const t = setup([{ project: "a", command: "tail" }]);
    await screen.findByRole("tab", { name: /demo/ }, SLOW);
    await t.quit();
    const dialog = await screen.findByRole("alertdialog", { name: "退出 Runyard？" }, SLOW);
    expect(within(dialog).getByText("demo：tail")).toBeTruthy();
    expect(within(dialog).queryByText(/api/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(t.replies()).toContainEqual({ id: 7, reply: "cancel" }));
    expect(t.replies()).not.toContainEqual({ id: 7, reply: "proceed" });
    // 再按一次 ⌘Q，这次选“退出”
    await t.quit();
    await user.click(await screen.findByRole("button", { name: "退出" }, SLOW));
    await waitFor(() => expect(t.replies()).toContainEqual({ id: 7, reply: "proceed" }));
  });

  it("[DESKTOP-TERMINAL-30] 没有终端在运行命令（都空闲）就不多问，直接放行", async () => {
    const t = setup([]);
    await screen.findByRole("tab", { name: /demo/ }, SLOW);
    await t.quit();
    await waitFor(() => expect(t.replies()).toContainEqual({ id: 7, reply: "proceed" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
