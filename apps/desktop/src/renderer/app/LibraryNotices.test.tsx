// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow, TabRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";
import { FolderMissing } from "./FolderMissing.tsx";
import { previewScreenOf } from "./failure-view.ts";
import { RunActionButton } from "./RunActionButton.tsx";
import { sampleTab } from "./sample-tab.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const user = userEvent.setup();

function row(id: string, extra: Partial<PlaygroundRow> = {}): PlaygroundRow {
  return {
    id,
    name: id,
    path: `/home/u/Runyard/${id}`,
    folder: `~/Runyard/${id}`,
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
    lastOpenedAt: NOW - 5 * MINUTE,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
    ...extra,
  };
}

function library(playgrounds: PlaygroundRow[], extra: Partial<LibraryState> = {}): LibraryState {
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
    ...extra,
  };
}

type Reply = (method: string, param: unknown) => unknown;

function setup(
  state: LibraryState,
  reply: Reply = () => undefined,
  locale: "zh-CN" | "en" = "zh-CN",
) {
  const calls: [string, unknown][] = [];
  const call = vi.fn(async (method: string, param?: unknown) => {
    calls.push([method, param]);
    return method === "library.get" ? state : reply(method, param);
  });
  const handlers: ((next: LibraryState) => void)[] = [];
  const push = (next: LibraryState) =>
    act(() => {
      for (const handler of handlers) handler(next);
    });
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale,
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const on = (_event: string, handler: (next: LibraryState) => void) => {
    handlers.push(handler);
    return () => {};
  };
  const bridge = { bootstrap, call, on } as unknown as DesktopBridge;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  const view = render(<AppFrame bridge={bridge} locale={locale} theme="light" />);
  return { ...view, calls, push };
}

const calledWith = (calls: [string, unknown][], method: string) =>
  calls.filter(([name]) => name === method).map(([, param]) => param);

async function bodyRow(id: string) {
  const table = await screen.findByRole("table", { name: /项目列表|Playgrounds/ });
  const found = table.querySelector(`[data-row-id="${id}"]`);
  if (found === null) throw new Error(`no row ${id}`);
  return found as HTMLElement;
}

const missing = (extra: Partial<PlaygroundRow> = {}) =>
  row("vue-drag-list", { missing: true, port: 7106, ...extra });

describe("找不到文件夹的行", () => {
  it("[DESKTOP-LIBRARY-VIEW-49] 状态写“找不到文件夹”，下方说明写原路径，有重新定位、从资源库移除、显示上一级文件夹三个操作", async () => {
    setup(library([missing(), row("next16-1")]));
    const line = await bodyRow("vue-drag-list");
    expect(within(line).getByText("找不到文件夹")).toBeTruthy();
    const note = document.querySelector('[data-missing-note="vue-drag-list"]') as HTMLElement;
    expect(note.textContent).toContain(
      "~/Runyard/vue-drag-list 不在原来的位置了。可能被移动、改名或删除。",
    );
    expect(within(note).getByRole("button", { name: "重新定位…" })).toBeTruthy();
    expect(within(note).getByRole("button", { name: "从资源库移除" })).toBeTruthy();
    expect(within(note).getByRole("button", { name: "在访达中显示上一级文件夹" })).toBeTruthy();
    // 别的行没有说明
    expect(document.querySelectorAll("[data-missing-note]")).toHaveLength(1);
  });

  it("[DESKTOP-LIBRARY-VIEW-49] 英文界面同一块", async () => {
    setup(library([missing()], { locale: "en" }), () => undefined, "en");
    const note = await screen.findByText(/is no longer where it was/);
    expect(note.textContent).toContain("~/Runyard/vue-drag-list is no longer where it was");
    expect(screen.getByRole("button", { name: "Locate…" })).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-50] 点“重新定位…”：向主进程要重新定位，主进程推来恢复后的状态，该行变回已停止、说明消失、端口不变", async () => {
    const { calls, push } = setup(library([missing()]), (method) =>
      method === "playground.relocate" ? { ok: true } : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "重新定位…" }));
    expect(calledWith(calls, "playground.relocate")).toEqual(["vue-drag-list"]);
    await push(library([row("vue-drag-list", { port: 7106 })]));
    const line = await bodyRow("vue-drag-list");
    expect(within(line).getByText("已停止")).toBeTruthy();
    expect(within(line).getByText(":7106")).toBeTruthy();
    expect(document.querySelector("[data-missing-note]")).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-51] 选错文件夹：写明“这个文件夹不是 vue-drag-list”，该行仍是找不到文件夹", async () => {
    setup(library([missing()]), (method) =>
      method === "playground.relocate"
        ? { ok: false, error: { code: "PLAYGROUND_NOT_FOUND", params: {} } }
        : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "重新定位…" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("这个文件夹不是 vue-drag-list");
    expect(document.querySelector("[data-missing-note]")).not.toBeNull();
    expect(screen.getByText("找不到文件夹")).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-51] 其他失败走失败说明，不冒充“选错了文件夹”", async () => {
    setup(library([missing()]), (method) =>
      method === "playground.relocate"
        ? {
            ok: false,
            error: {
              code: "DATA_FROM_NEWER_VERSION",
              params: { file: "library.json", found: 2, supported: 1 },
            },
          }
        : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "重新定位…" }));
    await screen.findByText("操作没有完成");
    expect(document.querySelector("[data-relocate-mismatch]")).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-52] 点“从资源库移除”：只发移除请求，不发移到废纸篓", async () => {
    const { calls } = setup(library([missing()]), (method) =>
      method === "playground.forget" ? { ok: true } : undefined,
    );
    await user.click(await screen.findByRole("button", { name: "从资源库移除" }));
    expect(calledWith(calls, "playground.forget")).toEqual(["vue-drag-list"]);
    expect(calledWith(calls, "playground.trash")).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-49] “在访达中显示上一级文件夹”发出请求", async () => {
    const { calls } = setup(library([missing()]));
    await user.click(await screen.findByRole("button", { name: "在访达中显示上一级文件夹" }));
    expect(calledWith(calls, "playground.revealParent")).toEqual(["vue-drag-list"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-49] 标签页里：文件夹找不到的项目显示同一条说明，不是预览或“运行”", async () => {
    const tab: TabRow = sampleTab({ id: "vue-drag-list", name: "vue-drag-list", missing: true });
    expect(previewScreenOf(tab)).toBe("folder-missing");
    const calls: [string, unknown][] = [];
    const bridge = {
      bootstrap: { platform: "darwin" },
      call: vi.fn(async (method: string, param?: unknown) => {
        calls.push([method, param]);
        return { ok: true };
      }),
      on: () => () => {},
    } as unknown as DesktopBridge;
    render(
      <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
        <FolderMissing bridge={bridge} tab={{ ...tab, folder: "~/Runyard/vue-drag-list" }} />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "找不到文件夹" })).toBeTruthy();
    expect(document.body.textContent).toContain("~/Runyard/vue-drag-list 不在原来的位置了");
    await user.click(screen.getByRole("button", { name: "重新定位…" }));
    expect(calledWith(calls, "playground.relocate")).toEqual(["vue-drag-list"]);
  });
});

describe("找不到文件夹的标签页的“运行”按钮", () => {
  it("[DESKTOP-LIBRARY-VIEW-49] 文件夹找不到时“运行”不可点，找到后可点", () => {
    const bridge = {
      bootstrap: { platform: "darwin" },
      call: vi.fn(),
      on: () => () => {},
    } as unknown as DesktopBridge;
    const view = (tab: TabRow) => (
      <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
        <RunActionButton bridge={bridge} tab={tab} />
      </I18nProvider>
    );
    const { rerender } = render(view(sampleTab({ state: "idle", active: false, missing: true })));
    expect((screen.getByRole("button", { name: "运行" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(view(sampleTab({ state: "idle", active: false, missing: false })));
    expect((screen.getByRole("button", { name: "运行" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

const agentRow = (extra: Partial<PlaygroundRow> = {}) =>
  row("react19-5", {
    createdBy: {
      kind: "agent",
      agent: "Claude Code",
      command: "runyard new react19 react19-5 --run --note …",
    },
    createdAt: NOW - 10 * MINUTE,
    ...extra,
  });

describe("智能体创建的项目", () => {
  it("[DESKTOP-LIBRARY-VIEW-53] 鼠标停在创建者徽标上：显示创建时间和这条命令", async () => {
    setup(library([agentRow()]));
    const badge = await screen.findByText("Claude Code");
    await user.hover(badge.parentElement as HTMLElement);
    // 提示默认悬停 600 毫秒后出现（组件自己的延迟），等它出现
    const tip = await screen.findByText(/命令：runyard new react19/, {}, { timeout: 3000 });
    expect(tip.textContent).toContain("命令：runyard new react19 react19-5 --run --note …");
    expect(tip.textContent).toContain("创建");
  });

  it("[DESKTOP-LIBRARY-VIEW-53] 行末的展开按钮在行下面展开“由 Claude Code 创建 · 时间 · 命令：…”，再点收起", async () => {
    setup(library([agentRow()]));
    const toggle = await screen.findByRole("button", { name: "展开创建信息" });
    await user.click(toggle);
    const details = document.querySelector('[data-creator-details="react19-5"]') as HTMLElement;
    expect(details.textContent).toContain("由 Claude Code 创建 · ");
    expect(details.textContent).toContain("命令：runyard new react19 react19-5 --run --note …");
    await user.click(screen.getByRole("button", { name: "收起创建信息" }));
    expect(document.querySelector("[data-creator-details]")).toBeNull();
  });
});

const noticeOf = () => ({
  kind: "agent-run" as const,
  id: "agent-run-1",
  playgroundId: "react19-5",
  name: "react19-5",
  agent: "Claude Code",
  url: "http://127.0.0.1:7113/",
  at: NOW,
});

describe("右下角的提示", () => {
  it("[DESKTOP-LIBRARY-VIEW-54] 出现“Claude Code 创建并运行了 react19-5”，有地址、“打开”“停止”；不抢焦点，也不动标签页", async () => {
    const focusBefore = document.activeElement;
    const { calls } = setup(library([agentRow()], { notices: [noticeOf()] }));
    const toast = await screen.findByRole("region", { name: "提示" });
    expect(toast.textContent).toContain("Claude Code 创建并运行了 react19-5");
    expect(toast.textContent).toContain("http://127.0.0.1:7113/");
    expect(within(toast).getByRole("button", { name: "打开" })).toBeTruthy();
    expect(within(toast).getByRole("button", { name: "停止" })).toBeTruthy();
    // 提示只是被画出来：焦点没动，也没有发出任何切换标签页或打开的请求
    expect(document.activeElement).toBe(focusBefore);
    expect(toast.contains(document.activeElement)).toBe(false);
    expect(calls.map(([method]) => method).filter((m) => m.startsWith("tab."))).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-54] 提示画在 body 下的浮层层里，并把自己占的矩形告诉外壳，预览才会让位", async () => {
    setup(library([agentRow()], { notices: [noticeOf()] }));
    const toast = await screen.findByRole("region", { name: "提示" });
    expect(toast.parentElement).toBe(document.body);
  });

  it("[DESKTOP-LIBRARY-VIEW-55] 点“打开”：请求打开它的标签页，并关掉提示", async () => {
    const { calls } = setup(library([agentRow()], { notices: [noticeOf()] }));
    const toast = await screen.findByRole("region", { name: "提示" });
    await user.click(within(toast).getByRole("button", { name: "打开" }));
    expect(calledWith(calls, "tab.open")).toEqual(["react19-5"]);
    expect(calledWith(calls, "notice.dismiss")).toEqual(["agent-run-1"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-54] 点“停止”停止这次运行；点关闭只关提示，不停止", async () => {
    const { calls } = setup(library([agentRow()], { notices: [noticeOf()] }));
    const toast = await screen.findByRole("region", { name: "提示" });
    await user.click(within(toast).getByRole("button", { name: "关闭提示" }));
    expect(calledWith(calls, "notice.dismiss")).toEqual(["agent-run-1"]);
    expect(calledWith(calls, "run.stop")).toEqual([]);
    await user.click(within(toast).getByRole("button", { name: "停止" }));
    expect(calledWith(calls, "run.stop")).toEqual(["react19-5"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-56] 没有提示时没有右下角的提示区，新行照常出现在列表里", async () => {
    setup(library([agentRow()]));
    await bodyRow("react19-5");
    expect(screen.queryByRole("region", { name: "提示" })).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-21] 创建时路径接近上限的提示：写项目名和提示原文，只有关闭按钮", async () => {
    setup(
      library([row("long")], {
        notices: [{ kind: "path-near-limit", id: "path-1", name: "long", length: 240, limit: 255 }],
      }),
    );
    const toast = await screen.findByRole("region", { name: "提示" });
    expect(toast.textContent).toContain("long 已创建");
    expect(toast.textContent).toContain("240");
    expect(within(toast).queryByRole("button", { name: "打开" })).toBeNull();
  });
});

describe("自动清理的提示条", () => {
  const tomorrow = () =>
    row("node-ts-1", {
      autoClean: { enabled: true, days: 30 },
      lastUsedAt: NOW - 29 * DAY - 60 * MINUTE,
      createdBy: { kind: "agent", agent: "Codex" },
    });
  const remind = (extra: Partial<LibraryState> = {}) =>
    library([tomorrow(), row("kept")], {
      cleanReminder: [{ id: "node-ts-1", name: "node-ts-1", idleDays: 29 }],
      cleanDueCount: 1,
      ...extra,
    });

  it("[DESKTOP-LIBRARY-VIEW-57] 保留列写“明天清理”；顶部提示条写“1 个项目明天会被自动清理：node-ts-1（已 29 天没打开）。”", async () => {
    setup(remind());
    const line = await bodyRow("node-ts-1");
    expect(within(line).getByText("明天清理")).toBeTruthy();
    const banner = document.querySelector("[data-clean-banner]") as HTMLElement;
    expect(banner.textContent).toContain("1 个项目明天会被自动清理：node-ts-1（已 29 天没打开）。");
    expect(within(banner).getByRole("button", { name: "改为保留" })).toBeTruthy();
    expect(within(banner).getByRole("button", { name: "现在清理" })).toBeTruthy();
    expect(within(banner).getByRole("button", { name: "稍后再说" })).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-57] 多个项目时列出名称；离到期还早的行不写“明天清理”", async () => {
    setup(
      remind({
        cleanReminder: [
          { id: "node-ts-1", name: "node-ts-1", idleDays: 29 },
          { id: "py-1", name: "py-1", idleDays: 29 },
        ],
      }),
    );
    const banner = await screen.findByRole("status", { name: "自动清理提醒" });
    expect(banner.textContent).toContain(
      "2 个项目明天会被自动清理：node-ts-1（已 29 天没打开）；py-1（已 29 天没打开）。",
    );
    const fresh = row("fresh", {
      autoClean: { enabled: true, days: 30 },
      lastUsedAt: NOW - 5 * DAY,
    });
    expect(within(await bodyRow("kept")).queryByText("明天清理")).toBeNull();
    cleanup();
    setup(library([fresh]));
    expect(within(await bodyRow("fresh")).getByText("剩 25 天")).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-58] 窗口看不见时不回报“提醒已显示”；窗口出现、提示条真显示后才回报，且只回报一次", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { calls } = setup(remind());
    await screen.findByRole("status", { name: "自动清理提醒" });
    expect(calledWith(calls, "clean.shown")).toEqual([]);
    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(calledWith(calls, "clean.shown")).toEqual([["node-ts-1"]]);
  });

  it("[DESKTOP-LIBRARY-VIEW-57] 窗口看得见时提示条一显示就回报“提醒已显示”", async () => {
    const { calls } = setup(remind());
    await screen.findByRole("status", { name: "自动清理提醒" });
    expect(calledWith(calls, "clean.shown")).toEqual([["node-ts-1"]]);
  });

  it("[DESKTOP-LIBRARY-VIEW-59] 点“改为保留”：请求把提示条里的项目都改为已保留；状态推来后提示条和行标签消失", async () => {
    const { calls, push } = setup(remind());
    await user.click(await screen.findByRole("button", { name: "改为保留" }));
    expect(calledWith(calls, "clean.keep")).toEqual([["node-ts-1"]]);
    await push(library([row("node-ts-1"), row("kept")], { cleanReminder: [], cleanDueCount: 0 }));
    expect(document.querySelector("[data-clean-banner]")).toBeNull();
    expect(within(await bodyRow("node-ts-1")).getByText("已保留")).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-60] 点“稍后再说”：请求收起，状态推来后提示条不见，该行仍写“明天清理”", async () => {
    const { calls, push } = setup(remind());
    await user.click(await screen.findByRole("button", { name: "稍后再说" }));
    expect(calledWith(calls, "clean.later")).toEqual([["node-ts-1"]]);
    await push(remind({ cleanReminder: [] }));
    expect(document.querySelector("[data-clean-banner]")).toBeNull();
    expect(within(await bodyRow("node-ts-1")).getByText("明天清理")).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-57] “现在清理”先走移到废纸篓的确认：确认后才请求，取消什么都不做", async () => {
    const { calls } = setup(remind());
    await user.click(await screen.findByRole("button", { name: "现在清理" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("node-ts-1");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(calledWith(calls, "playground.trash")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "现在清理" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /移到/ }),
    );
    expect(calledWith(calls, "playground.trash")).toEqual(["node-ts-1"]);
  });
});
