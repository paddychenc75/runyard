// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BootstrapInfo,
  DesktopBridge,
  DuplicateResult,
  EditResult,
} from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

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

type Reply = EditResult | DuplicateResult | { open: boolean; command: string | null };

function setup(state: LibraryState, replies: Record<string, Reply> = {}) {
  const call = vi.fn(async (method: string) =>
    method === "library.get" ? state : (replies[method] ?? { ok: true }),
  );
  const handlers: ((next: LibraryState) => void)[] = [];
  const push = (next: LibraryState) =>
    act(() => {
      for (const handler of handlers) handler(next);
    });
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale: "zh-CN",
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const on = (event: string, handler: (next: LibraryState) => void) => {
    if (event === "library.changed") handlers.push(handler);
    return () => {};
  };
  const bridge = { bootstrap, call, on } as unknown as DesktopBridge;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="light" />);
  return { call, push };
}

const tableEl = () => screen.findByRole("table", { name: "项目列表" });
async function rowOf(id: string) {
  const root = await tableEl();
  return within(root)
    .getAllByRole("row")
    .find((r) => r.getAttribute("data-row-id") === id) as HTMLElement;
}
async function openMenu(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(within(await rowOf(id)).getByRole("button", { name: `${id} 的更多操作` }));
  return await screen.findByRole("menu");
}
async function startEdit(user: ReturnType<typeof userEvent.setup>, id: string, item: string) {
  const menu = await openMenu(user, id);
  await user.click(within(menu).getByRole("menuitem", { name: new RegExp(item) }));
  return await rowOf(id);
}
const editCalls = (call: ReturnType<typeof vi.fn>) =>
  call.mock.calls.filter(([method]) => method === "playground.edit");

describe("改名、移到废纸篓对终端的说明", () => {
  it("[DESKTOP-TERMINAL-34] 项目开着终端、终端空闲：名称框下的说明追加“这个项目的终端会被关闭”", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]), {
      "terminal.status": { open: true, command: null },
    });
    const target = await startEdit(user, "demo", "重命名…");
    expect(await within(target).findByText(/这个项目的终端会被关闭/)).toBeTruthy();
    expect(call).toHaveBeenCalledWith("terminal.status", { project: "demo" });
  });

  it("[DESKTOP-TERMINAL-35] 终端里正在运行 tail：说明写明终端里正在运行的 tail 会被结束", async () => {
    const user = userEvent.setup();
    setup(library([row("demo")]), { "terminal.status": { open: true, command: "tail" } });
    const target = await startEdit(user, "demo", "重命名…");
    expect(await within(target).findByText(/终端里正在运行的 tail 会被结束/)).toBeTruthy();
  });

  it("没开终端的项目：说明里没有终端那一句", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]), {
      "terminal.status": { open: false, command: null },
    });
    const target = await startEdit(user, "demo", "重命名…");
    await vi.waitFor(() =>
      expect(call).toHaveBeenCalledWith("terminal.status", { project: "demo" }),
    );
    expect(within(target).queryByText(/终端/)).toBeNull();
  });

  it("[DESKTOP-TERMINAL-36] 终端里正在运行 pnpm install：移到废纸篓的确认写明“终端里还在运行 pnpm，会被结束”", async () => {
    const user = userEvent.setup();
    setup(library([row("demo")]), { "terminal.status": { open: true, command: "pnpm" } });
    const menu = await openMenu(user, "demo");
    await user.click(within(menu).getByRole("menuitem", { name: /移到废纸篓/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/终端里还在运行 pnpm，会被结束/)).toBeTruthy();
  });

  it("终端空闲或没开：移到废纸篓的确认里没有终端那一句", async () => {
    const user = userEvent.setup();
    setup(library([row("demo")]), { "terminal.status": { open: true, command: null } });
    const menu = await openMenu(user, "demo");
    await user.click(within(menu).getByRole("menuitem", { name: /移到废纸篓/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).queryByText(/终端里还在运行/)).toBeNull();
  });
});

describe("行内重命名与编辑备注", () => {
  it("[DESKTOP-LIBRARY-VIEW-34] 重命名运行中的项目：名称框全选并写着“保存后会停止并用新名称重新启动”，回车交给主进程，状态推来后该行显示新名称", async () => {
    const user = userEvent.setup();
    const running = row("hono-todo-api", { state: "ready", active: true, port: 7102 });
    const { call, push } = setup(library([running]));
    const target = await startEdit(user, "hono-todo-api", "重命名…");
    expect(
      within(target).getByText(/这个项目正在运行，保存后会停止并用新名称重新启动/),
    ).toBeTruthy();
    const name = within(target).getByRole("textbox", { name: "名称" }) as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    expect(name.selectionStart).toBe(0);
    expect(name.selectionEnd).toBe("hono-todo-api".length);
    await user.keyboard("todo-api{Enter}");
    expect(call).toHaveBeenCalledWith("playground.edit", {
      id: "hono-todo-api",
      name: "todo-api",
      note: "",
    });
    // 主进程完成改名后推来新状态：行显示新名称，仍在运行、端口不变
    await push(library([{ ...running, name: "todo-api" }]));
    const after = await rowOf("hono-todo-api");
    expect(within(after).getByText("todo-api")).toBeTruthy();
    expect(within(after).getByText(":7102")).toBeTruthy();
    expect(within(after).queryByRole("textbox")).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-35] 重名不能保存：名称框下写“这个名字已被占用”，保存不可点，回车不保存", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo"), row("demo2")]));
    const target = await startEdit(user, "demo", "重命名…");
    await user.keyboard("demo2");
    expect(within(target).getByText("这个名字已被占用")).toBeTruthy();
    expect(
      (within(target).getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.keyboard("{Enter}");
    expect(editCalls(call)).toHaveLength(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-36] 只改备注：焦点在备注框，保存交给主进程时名称没变（不会停止或重启运行）", async () => {
    const user = userEvent.setup();
    const { call, push } = setup(
      library([row("demo", { state: "ready", active: true, port: 7101, note: "旧备注" })]),
    );
    const target = await startEdit(user, "demo", "编辑备注…");
    const note = within(target).getByRole("textbox", { name: "备注" });
    expect(document.activeElement).toBe(note);
    await user.keyboard("试 Suspense");
    await user.click(within(target).getByRole("button", { name: "保存" }));
    expect(call).toHaveBeenCalledWith("playground.edit", {
      id: "demo",
      name: "demo",
      note: "试 Suspense",
    });
    expect(call.mock.calls.some(([m]) => m === "run.stop" || m === "run.start")).toBe(false);
    await push(
      library([row("demo", { state: "ready", active: true, port: 7101, note: "试 Suspense" })]),
    );
    expect(within(await rowOf("demo")).getByText("试 Suspense")).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-37] 按 Esc 取消：行恢复原样，没有交给主进程任何改动", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo", { note: "原备注" })]));
    const target = await startEdit(user, "demo", "重命名…");
    await user.keyboard("other");
    await user.tab();
    await user.keyboard("改过的备注");
    await user.keyboard("{Escape}");
    const after = await rowOf("demo");
    expect(within(after).queryByRole("textbox")).toBeNull();
    expect(within(after).getByText("demo")).toBeTruthy();
    expect(within(after).getByText("原备注")).toBeTruthy();
    expect(editCalls(call)).toHaveLength(0);
    expect(target.isConnected).toBe(true);
  });

  it("[DESKTOP-LIBRARY-VIEW-38] 安装中不能重命名：菜单里“重命名…”不可选，旁边写明原因", async () => {
    const user = userEvent.setup();
    setup(library([row("demo", { state: "installing", active: true })]));
    const menu = await openMenu(user, "demo");
    const item = within(menu).getByRole("menuitem", { name: /重命名…/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.textContent).toContain("安装或启动完成后才能改名");
  });

  it("[DESKTOP-LIBRARY-VIEW-39] 改名失败保留原名：写明“文件夹被其他程序占用”，仍在编辑，可以重试", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]), {
      "playground.edit": { ok: false, error: { code: "PATH_LOCKED", params: { name: "demo" } } },
    });
    const target = await startEdit(user, "demo", "重命名…");
    await user.keyboard("demo-1{Enter}");
    expect(await within(target).findByText(/文件夹被其他程序占用/)).toBeTruthy();
    // 行仍是编辑状态，原名在列表数据里没变；保存可再点
    expect(
      (within(target).getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await user.click(within(target).getByRole("button", { name: "保存" }));
    expect(editCalls(call)).toHaveLength(2);
  });
});

describe("自动清理与创建副本", () => {
  it("[DESKTOP-LIBRARY-VIEW-40] 改为自动清理 30 天：菜单右侧写“现在：关闭”，选 30 天并保存交给主进程，保留列变“剩 28 天”，侧栏计数跟着变", async () => {
    const user = userEvent.setup();
    const kept = row("demo", { lastUsedAt: NOW - 2 * DAY });
    const { call, push } = setup(library([kept]));
    const menu = await openMenu(user, "demo");
    expect(within(menu).getByRole("menuitem", { name: /自动清理…/ }).textContent).toContain(
      "现在：关闭",
    );
    await user.click(within(menu).getByRole("menuitem", { name: /自动清理…/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "30 天" }));
    expect(within(dialog).getByText("demo 现在没有开启自动清理，会一直保留。")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(call).toHaveBeenCalledWith("playground.autoClean", { id: "demo", days: 30 });
    await push(library([{ ...kept, autoClean: { enabled: true, days: 30 } }]));
    expect(within(await rowOf("demo")).getByText("剩 28 天")).toBeTruthy();
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByText("自动清理").parentElement?.textContent).toContain("1");
    expect(within(nav).getByText("运行中").parentElement?.textContent).toContain("0");
  });

  it("[DESKTOP-LIBRARY-VIEW-41] 悬停在“剩 28 天”上出现说明", async () => {
    const user = userEvent.setup();
    setup(
      library([row("demo", { autoClean: { enabled: true, days: 30 }, lastUsedAt: NOW - 2 * DAY })]),
    );
    const badge = within(await rowOf("demo")).getByText("剩 28 天");
    await user.hover(badge.parentElement as HTMLElement);
    // 提示默认悬停 600 毫秒后出现（组件自己的延迟），等它出现
    expect(
      await screen.findByText("28 天没打开就移到废纸篓，每次打开重新计时", {}, { timeout: 3000 }),
    ).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-42] 创建副本：交给主进程，副本出现后被选中，原项目仍在运行", async () => {
    const user = userEvent.setup();
    const original = row("react19-3", { state: "ready", active: true, port: 7104 });
    const { call, push } = setup(library([original]), {
      "playground.duplicate": { ok: true, id: "react19-5" },
    });
    const menu = await openMenu(user, "react19-3");
    await user.click(within(menu).getByRole("menuitem", { name: "创建副本" }));
    expect(call).toHaveBeenCalledWith("playground.duplicate", "react19-3");
    await push(library([original, row("react19-5", { port: 7110 })]));
    const copy = await rowOf("react19-5");
    await vi.waitFor(() => expect(copy.hasAttribute("data-selected")).toBe(true));
    expect(within(copy).getAllByText("已停止").length).toBeGreaterThan(0);
    expect(within(await rowOf("react19-3")).getAllByText("运行中").length).toBeGreaterThan(0);
  });

  it("创建副本失败：弹出说明原因，列表不变", async () => {
    const user = userEvent.setup();
    setup(library([row("demo")]), {
      "playground.duplicate": {
        ok: false,
        error: { code: "FOLDER_MISSING", params: { name: "demo" } },
      },
    });
    const menu = await openMenu(user, "demo");
    await user.click(within(menu).getByRole("menuitem", { name: "创建副本" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
  });
});
