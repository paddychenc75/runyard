// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// 最近使用列、行内操作的出现与键盘（规格 DESKTOP-LIBRARY-VIEW-94 至 96）

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

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
    templateId: "html",
    templateName: { en: "HTML", "zh-CN": "静态页面" },
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: NOW,
    lastOpenedAt: null,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
    ...extra,
  };
}

function setup(playgrounds: PlaygroundRow[]) {
  // 只把日期固定在 NOW：相对时间据此算，定时器仍是真的
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  const state: LibraryState = {
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
  const call = vi.fn(async (method: string) => (method === "library.get" ? state : undefined));
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
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="light" />);
  return { call };
}

const tableOf = () => screen.findByRole("table", { name: "项目列表" });
const rowEl = async (id: string) =>
  (await tableOf()).querySelector(`tr[data-row-id="${id}"]`) as HTMLElement;

it("[DESKTOP-SETTINGS-45] 设置标题的方向键与回车不操作隐藏的资源库选中行", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const { call } = setup([row("a"), row("b")]);
  const user = userEvent.setup();
  await user.click(await rowEl("a"));
  await user.click(screen.getByRole("button", { name: "设置" }));
  const title = await screen.findByRole("heading", { level: 1, name: "设置" });
  expect(document.activeElement).toBe(title);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(call).not.toHaveBeenCalledWith("tab.open", expect.anything());
  await user.click(screen.getByRole("button", { name: /^全部/ }));
  await user.keyboard("{Enter}");
  expect((await rowEl("a")).getAttribute("data-selected")).not.toBeNull();
});

describe("最近使用", () => {
  it("[DESKTOP-LIBRARY-VIEW-94] 打开、命令行运行、创建里最近的一次：从没在应用里打开过的也有时间，按它排序", async () => {
    setup([
      row("a", { lastOpenedAt: NOW - HOUR, lastUsedAt: NOW - HOUR }),
      row("b", { lastOpenedAt: null, lastUsedAt: NOW - 30 * MINUTE }),
      row("c", { lastOpenedAt: null, lastUsedAt: NOW - 10 * MINUTE, createdAt: NOW - 10 * MINUTE }),
    ]);
    const table = await tableOf();
    const ids = [...table.querySelectorAll("tbody tr[data-row-id]")].map((r) =>
      r.getAttribute("data-row-id"),
    );
    expect(ids).toEqual(["c", "b", "a"]);
    const used = (id: string) =>
      table.querySelector(`tr[data-row-id=${id}] td[data-column=lastUsed]`)?.textContent;
    expect([used("a"), used("b"), used("c")]).toEqual(["1 小时前", "30 分钟前", "10 分钟前"]);
    expect(screen.getByRole("columnheader", { name: "最近使用" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "大小" })).toBeTruthy();
    expect(table.querySelector("td[data-column=size]")?.textContent).toBe("计算中");
  });
});

describe("行内操作", () => {
  const rows = () => [
    row("demo", { createdBy: { kind: "agent", agent: "Claude Code" } }),
    row("web", { state: "ready", active: true, port: 7100 }),
  ];
  const revealed = (el: HTMLElement) => el.hasAttribute("data-revealed");

  it("[DESKTOP-LIBRARY-VIEW-95] 操作悬停或选中时才出现，一直在无障碍树里；运行中的行是“停止运行”和“更多”", async () => {
    const user = userEvent.setup();
    setup(rows());
    const demo = await rowEl("demo");
    const web = await rowEl("web");
    // 平时不显示（只靠透明度，按钮仍在无障碍树里）
    expect(revealed(demo)).toBe(false);
    expect(within(demo).getByRole("button", { name: "打开" })).toBeTruthy();
    expect(within(demo).getByRole("button", { name: /的更多操作$/ })).toBeTruthy();
    expect(demo.querySelector("td[data-column=actions]")?.hasAttribute("data-reveal")).toBe(true);
    await user.hover(demo);
    expect(revealed(demo)).toBe(true);
    await user.unhover(demo);
    expect(revealed(demo)).toBe(false);
    // 选中后鼠标移开仍在
    await user.click(demo);
    await user.unhover(demo);
    expect(revealed(demo)).toBe(true);
    // 悬停运行中的行：出现的是“停止运行”和“更多”
    await user.hover(web);
    expect(revealed(web)).toBe(true);
    expect(within(web).getByRole("button", { name: "停止运行" })).toBeTruthy();
    expect(within(web).queryByRole("button", { name: "打开" })).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-96] 表格只有一个 Tab 停点；选中行后 Tab 依次进入这一行的“打开”和“更多”，空格等同点击", async () => {
    const user = userEvent.setup();
    const { call } = setup(rows());
    const demo = await rowEl("demo");
    const table = await tableOf();
    expect(table.getAttribute("tabindex")).toBe("0");
    // 没被选中的行里的按钮不在 Tab 顺序里
    const buttons = [...table.querySelectorAll("tbody button")] as HTMLButtonElement[];
    expect(buttons.every((button) => button.tabIndex === -1)).toBe(true);
    await user.click(demo);
    expect(document.activeElement).toBe(table);
    await user.tab();
    expect(document.activeElement).toBe(within(demo).getByRole("button", { name: "打开" }));
    await user.tab();
    expect(document.activeElement).toBe(within(demo).getByRole("button", { name: /的更多操作$/ }));
    await user.tab({ shift: true });
    await user.keyboard(" ");
    expect(call).toHaveBeenCalledWith("tab.open", "demo");
  });
});
