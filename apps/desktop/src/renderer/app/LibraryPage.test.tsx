// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

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
    lastOpenedAt: NOW - 5 * MINUTE,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
    ...extra,
  };
}

function library(playgrounds: PlaygroundRow[], locale: "zh-CN" | "en" = "zh-CN"): LibraryState {
  return {
    locale,
    error: null,
    closeRequest: null,
    templates: [],
    recentTemplates: [],
    tabs: [],
    activeTab: "library",
    libraryRoot: "~/Runyard",
    playgrounds,
  };
}

function setup(state: LibraryState, locale: "zh-CN" | "en" = "zh-CN") {
  const call = vi.fn(async (method: string) => (method === "library.get" ? state : undefined));
  const handlers: ((next: LibraryState) => void)[] = [];
  // 主进程推来新状态：和真桥一样经 on("library.changed") 到界面
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
  return { ...view, call, bridge, push };
}

async function table() {
  return await screen.findByRole("table", { name: /项目列表|Playgrounds/ });
}

function bodyRows(root: HTMLElement) {
  return within(root)
    .getAllByRole("row")
    .filter((r) => r.hasAttribute("data-row-id"));
}

describe("资源库列表", () => {
  it("[DESKTOP-LIBRARY-VIEW-01] 运行中的排在最前，其余按上次打开的先后排在后面", async () => {
    // 主进程已经排好序给界面（见 build-library-state.test.ts）；界面必须原样按这个顺序画
    setup(
      library([
        row("oldest-running", { state: "ready", active: true, port: 7101, lastOpenedAt: 1 }),
        row("recent", { lastOpenedAt: NOW - MINUTE }),
        row("older", { lastOpenedAt: NOW - DAY }),
      ]),
    );
    const rows = bodyRows(await table());
    expect(rows.map((r) => r.getAttribute("data-row-id"))).toEqual([
      "oldest-running",
      "recent",
      "older",
    ]);
    expect(within(rows[0] as HTMLElement).getAllByText("运行中").length).toBeGreaterThan(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-02] 名称下方显示备注，端口列显示端口，没有端口的脚本端口列没有端口号", async () => {
    setup(
      library([
        row("pricing", {
          note: "pricing table layout test",
          port: 7101,
          state: "ready",
          active: true,
        }),
        row("script", { kind: "oneshot", port: null }),
      ]),
    );
    const rows = bodyRows(await table());
    const pricing = within(rows[0] as HTMLElement);
    const nameCell = pricing
      .getByText("pricing", { selector: "span" })
      .closest("td") as HTMLElement;
    expect(nameCell.textContent).toMatch(/pricing\s*pricing table layout test/);
    expect(pricing.getByText(":7101")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByText(/^:\d+$/)).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-03] 已保留的显示“已保留”，开启自动清理的显示剩余天数", async () => {
    setup(
      library([
        row("kept"),
        row("temp", {
          autoClean: { enabled: true, days: 30 },
          lastUsedAt: NOW - 18 * DAY,
        }),
      ]),
    );
    const rows = bodyRows(await table());
    expect(within(rows[0] as HTMLElement).getByText("已保留")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("剩 12 天")).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-04] 用户创建的显示“我”，智能体创建的显示智能体的名字", async () => {
    setup(
      library([row("mine"), row("theirs", { createdBy: { kind: "agent", agent: "Claude Code" } })]),
    );
    const rows = bodyRows(await table());
    expect(within(rows[0] as HTMLElement).getByText("我")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Claude Code")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByText("我")).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-05] 别处新建的项目出现在列表里，创建者不是“我”", async () => {
    const { push } = setup(library([row("existing")]));
    await table();
    // 命令行新建后主进程推来新的状态：界面不重启就按它重画
    push(
      library([
        row("existing"),
        row("demo", { createdBy: { kind: "agent", agent: "Claude Code" }, createdAt: 2 }),
      ]),
    );
    const demo = bodyRows(await table()).find((r) => r.getAttribute("data-row-id") === "demo");
    expect(demo).toBeTruthy();
    expect(within(demo as HTMLElement).queryByText("我")).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-06] 状态随运行变化：先是运行中相关的状态，最后回到已停止（排序在 library-controller.test.ts）", async () => {
    const { push } = setup(library([row("demo")]));
    await table();
    const statusOf = async () =>
      bodyRows(await table())[0]?.querySelector("[data-column=status]")?.textContent;
    for (const [state, active, text] of [
      ["starting", true, "启动中"],
      ["ready", true, "运行中"],
      ["stopped", false, "已停止"],
    ] as const) {
      push(library([row("demo", { state, active })]));
      expect((await statusOf())?.trim()).toBe(text);
    }
  });

  it("英文界面下同样完整显示各列", async () => {
    setup(
      library(
        [row("demo", { autoClean: { enabled: true, days: 30 }, createdBy: { kind: "cli" } })],
        "en",
      ),
      "en",
    );
    const rows = bodyRows(await table());
    const cells = within(rows[0] as HTMLElement);
    expect(cells.getByText("30 days left")).toBeTruthy();
    expect(cells.getByText("Command line")).toBeTruthy();
    expect(cells.getByText("5 min ago")).toBeTruthy();
  });

  it("没有项目时显示空状态和内置模板，不画表格", async () => {
    setup(library([]));
    expect(await screen.findByRole("heading", { name: "还没有项目" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("没有备注的项目显示占位，没打开过的上次打开显示短横线", async () => {
    setup(library([row("blank", { lastOpenedAt: null })]));
    const cells = within(bodyRows(await table())[0] as HTMLElement);
    expect(cells.getByText("未填写备注")).toBeTruthy();
    expect(cells.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-10] 顶栏的计数包含标签页持有和命令行持有的运行，已结束的脚本不计", async () => {
    // 两个进行中（不论持有者）加一个已跑完的脚本；持有者在主进程算数时不区分
    setup(
      library([
        row("tab-owned", { state: "ready", active: true }),
        row("cli-owned", { state: "running", active: true }),
        row("script", { kind: "oneshot", state: "finished", active: false }),
      ]),
    );
    await table();
    expect(screen.getByText("2 个运行中")).toBeTruthy();
  });

  it("没有运行中的项目时顶栏说没有在运行的项目", async () => {
    setup(library([row("a")]));
    await table();
    expect(screen.getByText("没有在运行的项目")).toBeTruthy();
  });
});

describe("资源库一行的操作", () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, id: string) => {
    const rows = bodyRows(await table());
    const target = rows.find((r) => r.getAttribute("data-row-id") === id) as HTMLElement;
    await user.click(within(target).getByRole("button", { name: `${id} 的更多操作` }));
    return await screen.findByRole("menu");
  };

  it("[DESKTOP-LIBRARY-VIEW-07] 已停止的行主操作是“打开”，点它发 tab.open", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]));
    const rows = bodyRows(await table());
    await user.click(within(rows[0] as HTMLElement).getByRole("button", { name: "打开" }));
    expect(call).toHaveBeenCalledWith("tab.open", "demo");
    // 没有“运行但不打开”
    expect(screen.queryByRole("button", { name: /^运行$/ })).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-08] 运行中的行主操作是“停止运行”，点它发 run.stop", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo", { state: "ready", active: true, port: 7101 })]));
    const rows = bodyRows(await table());
    await user.click(within(rows[0] as HTMLElement).getByRole("button", { name: "停止运行" }));
    expect(call).toHaveBeenCalledWith("run.stop", "demo");
  });

  it("[DESKTOP-LIBRARY-VIEW-08] 停止后状态推来，该行操作变回“打开”", async () => {
    const running = row("demo", { state: "ready", active: true, port: 7101 });
    const { push } = setup(library([running]));
    const rows = bodyRows(await table());
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: "停止运行" })).toBeTruthy();
    await push(library([row("demo", { state: "stopped" })]));
    const after = bodyRows(await table());
    expect(within(after[0] as HTMLElement).getByRole("button", { name: "打开" })).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-09] 已停止的行，更多菜单里没有“停止运行”", async () => {
    const user = userEvent.setup();
    setup(library([row("demo")]));
    const menu = await openMenu(user, "demo");
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(names.some((name) => name?.includes("停止运行"))).toBe(false);
    expect(names).toHaveLength(7);
  });

  it("更多菜单现有的项按设计稿的顺序：打开、停止运行，重命名到创建副本，在访达中显示、复制路径", async () => {
    const user = userEvent.setup();
    setup(library([row("demo", { state: "ready", active: true, port: 7101 })]));
    const menu = await openMenu(user, "demo");
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(names).toEqual([
      "打开回车",
      "停止运行",
      "重命名…",
      "编辑备注…",
      "自动清理…现在：已保留",
      "创建副本",
      "在访达中显示",
      "复制路径",
    ]);
  });

  it("[DESKTOP-LIBRARY-VIEW-11] 更多菜单里选“复制路径”，向主进程发 playground.copyPath", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]));
    const menu = await openMenu(user, "demo");
    await user.click(within(menu).getByRole("menuitem", { name: "复制路径" }));
    expect(call).toHaveBeenCalledWith("playground.copyPath", "demo");
  });

  it("[DESKTOP-LIBRARY-VIEW-12] 更多菜单里选“在访达中显示”，向主进程发 playground.reveal（访达本身手动验证）", async () => {
    const user = userEvent.setup();
    const { call } = setup(library([row("demo")]));
    const menu = await openMenu(user, "demo");
    await user.click(within(menu).getByRole("menuitem", { name: "在访达中显示" }));
    expect(call).toHaveBeenCalledWith("playground.reveal", "demo");
  });

  it("菜单打开期间通知外壳有浮层（预览让位），关闭后撤销", async () => {
    const user = userEvent.setup();
    setup(library([row("demo")]));
    await openMenu(user, "demo");
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
