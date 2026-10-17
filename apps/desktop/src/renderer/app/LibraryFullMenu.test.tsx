// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge, EditResult } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

function row(id: string, extra: Partial<PlaygroundRow> = {}): PlaygroundRow {
  return {
    id,
    name: id,
    path: `/lib/${id}`,
    kind: "server",
    state: "idle",
    active: false,
    previewing: false,
    busy: false,
    note: "",
    templateId: "react19",
    templateName: { en: "React 19", "zh-CN": "React 19" },
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: NOW,
    lastOpenedAt: NOW - 60_000,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
    ...extra,
  };
}

function library(playgrounds: PlaygroundRow[]): LibraryState {
  return {
    locale: "zh-CN",
    error: null,
    closeRequest: null,
    templates: [],
    runs: [],
    loaded: true,
    recentTemplates: [],
    tabs: [],
    activeTab: "library",
    libraryRoot: "~/Runyard",
    playgrounds,
  };
}

function setup(state: LibraryState, replies: Record<string, EditResult> = {}) {
  const call = vi.fn(async (method: string) =>
    method === "library.get" ? state : (replies[method] ?? { ok: true }),
  );
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale: "zh-CN",
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const bridge = { bootstrap, call, on: () => () => {} } as unknown as DesktopBridge;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="light" />);
  return { call };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, id: string) {
  const root = await screen.findByRole("table", { name: "项目列表" });
  const target = within(root)
    .getAllByRole("row")
    .find((r) => r.getAttribute("data-row-id") === id) as HTMLElement;
  await act(async () => {});
  await user.click(within(target).getByRole("button", { name: `${id} 的更多操作` }));
  return await screen.findByRole("menu");
}

const pick = async (
  user: ReturnType<typeof userEvent.setup>,
  menu: HTMLElement,
  name: string | RegExp,
) => await user.click(within(menu).getByRole("menuitem", { name }));

describe("资源库行的更多菜单：废纸篓、编辑器、终端、链接、只打开", () => {
  it("[DESKTOP-LIBRARY-VIEW-32] 找不到文件夹的行，菜单里只有“重新定位…”“从资源库移除”“复制路径”", async () => {
    const user = userEvent.setup();
    setup(library([row("vue-drag-list", { missing: true })]));
    const menu = await openMenu(user, "vue-drag-list");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["重新定位…", "从资源库移除", "复制路径"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-33] 选“打开但不运行”，向主进程发 tab.openWithoutRun，不发 tab.open", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]));
    await pick(user, await openMenu(user, "demo"), "打开但不运行");
    expect(call).toHaveBeenCalledWith("tab.openWithoutRun", "demo");
    expect(call).not.toHaveBeenCalledWith("tab.open", "demo");
  });

  it("[DESKTOP-LIBRARY-VIEW-46] 选“复制链接”，剪贴板收到 runyard://open/<名称>", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]));
    await pick(user, await openMenu(user, "demo"), "复制链接");
    expect(call).toHaveBeenCalledWith("clipboard.copy", "runyard://open/demo");
  });

  it("[DESKTOP-LIBRARY-VIEW-47] 选“在外部编辑器中打开”，请求主进程用设置里的编辑器打开这个项目", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]));
    await pick(user, await openMenu(user, "demo"), "在外部编辑器中打开");
    expect(call).toHaveBeenCalledWith("playground.openInEditor", "demo");
  });

  it("[DESKTOP-LIBRARY-VIEW-48] 选“在终端中打开”，应用发出请求（终端本身手动验证）", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]));
    await pick(user, await openMenu(user, "demo"), "在终端中打开");
    expect(call).toHaveBeenCalledWith("playground.openTerminal", "demo");
  });

  it("[DESKTOP-LIBRARY-VIEW-43] 选“移到废纸篓”弹出确认：标题、说明（没在运行）、取消和移到废纸篓；确认前不发请求，Esc 等于取消", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("react18-1")]));
    await pick(user, await openMenu(user, "react18-1"), "移到废纸篓");
    const dialog = await screen.findByRole("alertdialog", { name: "把 react18-1 移到废纸篓？" });
    expect(
      within(dialog).getByText("文件夹会移到废纸篓，可以在废纸篓里恢复。它现在没有在运行。"),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "移到废纸篓" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(call).not.toHaveBeenCalledWith("playground.trash", "react18-1");
  });

  it("[DESKTOP-LIBRARY-VIEW-44] 运行中的行，确认说明写“会先停止运行”，点确认后向主进程发 playground.trash", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo", { state: "ready", active: true, port: 7101 })]));
    await pick(user, await openMenu(user, "demo"), "移到废纸篓");
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/会先停止运行/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "移到废纸篓" }));
    expect(call).toHaveBeenCalledWith("playground.trash", "demo");
  });

  it("[DESKTOP-LIBRARY-VIEW-45] 放不进废纸篓：显示失败原因，说明项目没有被永久删除", async () => {
    const user = userEvent.setup();
    setup(library([row("demo")]), {
      "playground.trash": {
        ok: false,
        error: { code: "TRASH_UNAVAILABLE", params: { name: "demo" } },
      },
    });
    await pick(user, await openMenu(user, "demo"), "移到废纸篓");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "移到废纸篓" }),
    );
    const failed = await screen.findByRole("alertdialog", { name: "操作没有完成" });
    expect(within(failed).getByText(/无法把项目 demo 移到废纸篓/)).toBeTruthy();
    expect(within(failed).getByText(/也没有被永久删除/)).toBeTruthy();
  });
});
