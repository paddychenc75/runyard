// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, RunningRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";
import { sampleTab } from "./sample-tab.ts";

afterEach(cleanup);

// 整个外壳加浮层在慢机器上要一两秒才画出来，默认的 1 秒等待不够
const SLOW = { timeout: 8000 };
vi.setConfig({ testTimeout: 20_000 });

(Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

const NOW = Date.now();
const MIN = 60_000;

function run(id: string, extra: Partial<RunningRow> = {}): RunningRow {
  return {
    runId: `run-${id}`,
    id,
    name: id,
    templateName: { en: "Hono", "zh-CN": "Hono" },
    port: 7101,
    startedAt: NOW - 47 * MIN,
    source: { kind: "tab" },
    ...extra,
  };
}

const four: RunningRow[] = [
  run("react-counter", { port: 7101, startedAt: NOW - 134 * MIN }),
  run("hono-todo-api", { port: 7102 }),
  run("hono-1", {
    port: 7103,
    startedAt: NOW - 31 * MIN,
    source: { kind: "cli", agent: "Claude Code" },
  }),
  run("react19-3", {
    port: 7104,
    startedAt: NOW - 58 * MIN,
    source: { kind: "cli", agent: "Claude Code" },
  }),
];

const base: LibraryState = {
  locale: "zh-CN",
  libraryRoot: "~/Runyard",
  error: null,
  closeRequest: null,
  templates: [],
  runs: four,
  loaded: true,
  recentTemplates: [],
  tabs: [],
  activeTab: "library",
  playgrounds: [],
};

function setup(state: LibraryState) {
  const call = vi.fn(async (method: string) =>
    method === "library.get" ? state : method === "console.get" ? [] : undefined,
  );
  const listeners = new Map<string, (payload: unknown) => void>();
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
    on: (event: string, listener: (payload: unknown) => void) => {
      listeners.set(event, listener);
      return () => {};
    },
  } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
  return {
    call,
    push: (next: LibraryState) => act(() => listeners.get("library.changed")?.(next)),
  };
}

// 状态里的计数来自 playgrounds，这里只需要 4 个运行中的行
function withRunning(state: LibraryState): LibraryState {
  const rows = state.runs.map((item) => ({ ...item, active: true }));
  return {
    ...state,
    playgrounds: rows.map((item) => ({
      id: item.id,
      name: item.name,
      path: `/lib/${item.id}`,
      kind: "server",
      state: "ready",
      active: true,
      previewing: false,
      busy: false,
      note: "",
      templateId: "hono",
      templateName: null,
      port: item.port,
      autoClean: { enabled: false, days: null },
      lastUsedAt: 1,
      lastOpenedAt: null,
      createdBy: { kind: "user" },
      createdAt: 1,
      missing: false,
    })),
  };
}

async function openList(state: LibraryState) {
  const user = userEvent.setup();
  const ctx = setup(withRunning(state));
  await user.click(await screen.findByRole("button", { name: /个运行中/ }, SLOW));
  const dialog = await screen.findByRole("dialog", { name: "运行中的项目" }, SLOW);
  return { ...ctx, user, dialog };
}

describe("运行视图（N 个运行中）", () => {
  it("[DESKTOP-WORKSPACE-43] 列出两类运行：前两行来源是标签页，后两行是命令行 · Claude Code 并写空闲后自动停止，每行有端口、时长和停止", async () => {
    const { dialog } = await openList(base);
    const rows = within(dialog).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0] as HTMLElement).getByText("标签页")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("标签页")).toBeTruthy();
    for (const index of [2, 3]) {
      const row = within(rows[index] as HTMLElement);
      expect(row.getByText("命令行 · Claude Code")).toBeTruthy();
      expect(row.getByText("空闲后自动停止")).toBeTruthy();
    }
    expect(within(rows[0] as HTMLElement).queryByText("空闲后自动停止")).toBeNull();
    expect(within(rows[0] as HTMLElement).getByText(":7101")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("已运行 2 小时 14 分钟")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("已运行 47 分钟")).toBeTruthy();
    expect(within(dialog).getAllByRole("button", { name: /^停止 / })).toHaveLength(4);
    expect(within(dialog).getByText(/标签页打开的，关闭标签页即停止/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "4 个运行中" })).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-44] 点某一行的“停止”只停这一个", async () => {
    const { dialog, user, call } = await openList(base);
    await user.click(within(dialog).getByRole("button", { name: "停止 hono-1" }));
    expect(call).toHaveBeenCalledWith("run.stop", "hono-1");
    expect(call.mock.calls.filter((args) => args[0] === "run.stop")).toHaveLength(1);
  });

  it("[DESKTOP-WORKSPACE-45] 点“全部停止”调用全部停止；没有运行时它是灰的", async () => {
    const { dialog, user, call, push } = await openList(base);
    await user.click(within(dialog).getByRole("button", { name: "全部停止" }));
    expect(call).toHaveBeenCalledWith("run.stopAll");
    push(withRunning({ ...base, runs: [] }));
    expect(
      (within(dialog).getByRole("button", { name: "全部停止" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(dialog).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("[DESKTOP-WORKSPACE-46] 点一行（不在按钮上）打开它的标签页，弹层关闭", async () => {
    const { dialog, user, call } = await openList(base);
    await user.click(within(dialog).getByRole("button", { name: "查看 react19-3" }));
    expect(call).toHaveBeenCalledWith("tab.open", "react19-3");
    expect(call).not.toHaveBeenCalledWith("run.stop", "react19-3");
    expect(screen.queryByRole("dialog", { name: "运行中的项目" })).toBeNull();
  });

  it("按 Esc 或点弹层外都关闭弹层", async () => {
    const { user } = await openList(base);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "运行中的项目" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /个运行中/ }));
    await screen.findByRole("dialog", { name: "运行中的项目" });
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "运行中的项目" })).toBeNull();
  });
});

describe("运行视图的层", () => {
  it("[DESKTOP-WORKSPACE-47] 弹层画在 body 下的浮层层里，不在顶栏里面（否则页面内容会盖住它），并登记为浮层让原生预览让位", async () => {
    const { dialog } = await openList(base);
    expect(dialog.parentElement).toBe(document.body);
    expect(document.querySelector("[data-run-bar], [role=tablist]")?.contains(dialog)).toBe(false);
  });
});

describe("命令行持有的运行的查看画面", () => {
  const attachedTab = sampleTab({
    id: "hono-1",
    name: "hono-1",
    ownedByTab: false,
    attached: { agent: "Claude Code", startedAt: NOW - 31 * MIN },
  });
  const viewing: LibraryState = { ...base, runs: [], tabs: [attachedTab], activeTab: "hono-1" };

  it("[DESKTOP-WORKSPACE-48] 出现说明条和两个按钮，运行条写由命令行启动、关闭标签页不会停止", async () => {
    setup(viewing);
    const notice = await screen.findByRole("region", { name: "命令行启动的运行" }, SLOW);
    expect(
      within(notice).getByText("这个项目由 Claude Code 在 31 分钟前 通过命令行启动。"),
    ).toBeTruthy();
    expect(within(notice).getByText(/改为由我管理后，关闭标签页就会停止它/)).toBeTruthy();
    expect(within(notice).getByRole("button", { name: "改为由我管理" })).toBeTruthy();
    expect(within(notice).getByRole("button", { name: "停止" })).toBeTruthy();
    expect(screen.getByText("由命令行启动，关闭标签页不会停止")).toBeTruthy();
    expect(screen.queryByText("关闭标签页即停止")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-49] 点“改为由我管理”请求改持有者；改完后说明条消失、运行条写关闭标签页即停止", async () => {
    const user = userEvent.setup();
    const { call, push } = setup(viewing);
    await user.click(await screen.findByRole("button", { name: "改为由我管理" }, SLOW));
    expect(call).toHaveBeenCalledWith("run.adopt", "hono-1");
    push({ ...viewing, tabs: [sampleTab({ id: "hono-1", name: "hono-1" })] });
    await screen.findByText("关闭标签页即停止");
    expect(screen.queryByRole("region", { name: "命令行启动的运行" })).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-50] 点说明条上的“停止”只停这次运行，标签页留着", async () => {
    const user = userEvent.setup();
    const { call } = setup(viewing);
    const notice = await screen.findByRole("region", { name: "命令行启动的运行" }, SLOW);
    await user.click(within(notice).getByRole("button", { name: "停止" }));
    expect(call).toHaveBeenCalledWith("run.stop", "hono-1");
    expect(call).not.toHaveBeenCalledWith("tab.close", "hono-1");
  });
});

describe("首次启动的选择器", () => {
  it("[DESKTOP-CREATE-FLOW-01] 首次状态推送还没读到资源库（loaded 为假）时不弹出选择器，读到确实为空才弹出（#298）", async () => {
    const empty: LibraryState = { ...base, runs: [], loaded: false };
    const { push } = setup(empty);
    await screen.findByText(/没有在运行的项目/, undefined, SLOW);
    expect(screen.queryByRole("dialog")).toBeNull();
    // 读到的资源库有项目：始终不弹
    push({ ...empty, loaded: true, playgrounds: withRunning(base).playgrounds.slice(0, 1) });
    await screen.findByText("hono-1", undefined, SLOW).catch(() => undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-01] 读到资源库确实为空时弹出选择器", async () => {
    const { push } = setup({ ...base, runs: [], loaded: false });
    push({ ...base, runs: [], loaded: true });
    await screen.findByRole("dialog", undefined, SLOW);
  });
});
