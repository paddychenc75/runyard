// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(cleanup);

// 这个文件只关心外壳，列表各列的内容由 LibraryPage.test.tsx 测
function row(
  extra: Pick<PlaygroundRow, "id" | "name" | "kind" | "state" | "active">,
): PlaygroundRow {
  return {
    previewing: false,
    busy: false,
    note: "",
    templateId: "html",
    templateName: null,
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: 1,
    lastOpenedAt: null,
    createdBy: { kind: "user" },
    createdAt: 1,
    ...extra,
  };
}

const state: LibraryState = {
  locale: "zh-CN",
  error: null,
  templates: [{ id: "html", name: { en: "Plain HTML", "zh-CN": "纯 HTML" } }],
  playgrounds: [
    row({ id: "a", name: "react-counter", kind: "server", state: "ready", active: true }),
    row({ id: "b", name: "landing-hero", kind: "static", state: "idle", active: false }),
  ],
};

function fakeBridge(overrides: Partial<BootstrapInfo> = {}) {
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
      ...overrides,
    },
    call,
    on: () => () => {},
  } as unknown as DesktopBridge;
  return { bridge, call };
}

describe("主窗口外壳", () => {
  it("[DESKTOP-WORKSPACE-03] 资源库标签固定在第一位、没有关闭按钮，⌘W 在它上面不起作用", () => {
    const { bridge } = fakeBridge();
    render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.textContent).toBe("资源库");
    expect(within(screen.getByRole("tablist")).queryByRole("button")).toBeNull();
    const event = new KeyboardEvent("keydown", { key: "w", metaKey: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.keyDown(document.body, { key: "w", metaKey: true });
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("语言和主题变了，文字、<html lang>、data-theme 跟着变，不需要刷新", () => {
    const { bridge } = fakeBridge();
    const { rerender } = render(<AppFrame bridge={bridge} locale="zh-CN" theme="light" />);
    expect(screen.getByRole("navigation", { name: "资源库导航" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.documentElement.dataset.theme).toBe("light");
    rerender(<AppFrame bridge={bridge} locale="en" theme="dark" />);
    expect(screen.getByRole("navigation", { name: "Library navigation" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Library" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.title).toBe("Runyard");
  });

  it("侧栏显示项目总数，未做的筛选项和页面列出但点不了", async () => {
    const { bridge } = fakeBridge();
    render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
    expect(await screen.findByRole("button", { name: /^全部\s*2$/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: "模板" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("开发期的运行、停止按钮和用模板新建仍在", async () => {
    const user = userEvent.setup();
    const { bridge, call } = fakeBridge();
    render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
    await screen.findByText("react-counter");
    await user.click(screen.getByRole("button", { name: "停止" }));
    await user.click(screen.getByRole("button", { name: "运行" }));
    await user.click(screen.getByRole("button", { name: /纯 HTML/ }));
    expect(call).toHaveBeenCalledWith("run.stop", "a");
    expect(call).toHaveBeenCalledWith("run.start", "b");
    expect(call).toHaveBeenCalledWith("playground.create", "html");
  });

  it("点资源库标签就是回到列表：让开发期的预览让开", async () => {
    const user = userEvent.setup();
    const { bridge, call } = fakeBridge();
    render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
    await user.click(screen.getByRole("tab", { name: "资源库" }));
    expect(call).toHaveBeenCalledWith("preview.select", null);
  });

  it("没有窗口按钮要让位的系统（inset 为 0）不留空", () => {
    const { bridge } = fakeBridge({ windowControls: { side: "right", inset: 0 } });
    const { container } = render(<AppFrame bridge={bridge} locale="en" theme="system" />);
    expect(container.querySelector("header[data-controls]")?.getAttribute("data-controls")).toBe(
      "none",
    );
  });
});
