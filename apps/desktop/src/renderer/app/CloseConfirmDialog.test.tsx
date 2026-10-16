// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(cleanup);

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

const tab = {
  id: "a",
  name: "hono-todo-api",
  status: "running" as const,
  state: "ready" as const,
  active: true,
  busy: false,
  previewUrl: null,
};

const base: LibraryState = {
  locale: "zh-CN",
  error: null,
  closeRequest: null,
  templates: [],
  tabs: [tab],
  activeTab: "a",
  playgrounds: [],
};

function setup(state: LibraryState) {
  const call = vi.fn(async (method: string) => (method === "library.get" ? state : undefined));
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
    on: () => () => {},
  } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
  return call;
}

const asking: LibraryState = { ...base, closeRequest: { id: "a", name: "hono-todo-api" } };

describe("关闭标签页的确认对话框", () => {
  it("点标签上的关闭钮和按 ⌘W 都只是请求关闭当前项目标签，交给主进程判断", async () => {
    const user = userEvent.setup();
    const call = setup(base);
    await user.click(await screen.findByRole("button", { name: "关闭 hono-todo-api" }));
    expect(call).toHaveBeenCalledWith("tab.close", "a");
    call.mockClear();
    await user.keyboard("{Meta>}w{/Meta}");
    expect(call).toHaveBeenCalledWith("tab.close", "a");
  });

  it("[DESKTOP-WORKSPACE-04] 主进程要求确认时弹出：写明会停止运行，有取消、关闭并停止和不再提示", async () => {
    setup(asking);
    const dialog = await screen.findByRole("alertdialog", {
      name: "关闭 hono-todo-api 并停止运行？",
    });
    expect(within(dialog).getByText(/代码和文件不受影响/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "关闭并停止" })).toBeTruthy();
    const box = within(dialog).getByRole("checkbox", { name: "不再提示" });
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("没有确认请求时不显示对话框", async () => {
    setup(base);
    await screen.findByRole("tab", { name: /hono-todo-api/ });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-05] 点“关闭并停止”发确认，没勾选就是 dontAskAgain: false", async () => {
    const user = userEvent.setup();
    const call = setup(asking);
    await user.click(await screen.findByRole("button", { name: "关闭并停止" }));
    expect(call).toHaveBeenCalledWith("tab.closeConfirm", { id: "a", dontAskAgain: false });
  });

  it("[DESKTOP-WORKSPACE-06] 点“取消”只发取消；Escape 同样", async () => {
    const user = userEvent.setup();
    const call = setup(asking);
    await user.click(await screen.findByRole("button", { name: "取消" }));
    await user.keyboard("{Escape}");
    const methods = call.mock.calls.map((args) => args[0]);
    expect(methods.filter((method) => method === "tab.closeCancel")).toHaveLength(2);
    expect(methods).not.toContain("tab.closeConfirm");
  });

  it("[DESKTOP-WORKSPACE-07] 勾选“不再提示”再点“关闭并停止”，确认里带 dontAskAgain: true", async () => {
    const user = userEvent.setup();
    const call = setup(asking);
    await user.click(await screen.findByRole("checkbox", { name: "不再提示" }));
    await user.click(screen.getByRole("button", { name: "关闭并停止" }));
    expect(call).toHaveBeenCalledWith("tab.closeConfirm", { id: "a", dontAskAgain: true });
  });

  it("[DESKTOP-WORKSPACE-08] 勾选后点“取消”：界面只发取消，不带勾选", async () => {
    const user = userEvent.setup();
    const call = setup(asking);
    await user.click(await screen.findByRole("checkbox", { name: "不再提示" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(call).toHaveBeenCalledWith("tab.closeCancel");
    expect(call.mock.calls.map((args) => args[0])).not.toContain("tab.closeConfirm");
  });
});
