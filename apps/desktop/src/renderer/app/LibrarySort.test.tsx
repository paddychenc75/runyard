// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type {
  LibraryState,
  PlaygroundRow,
  RowSize,
  TemplateRow,
} from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(cleanup);

// 可点表头的悬停提示、升降序切换、下拉里的方向和键盘焦点环（规格 DESKTOP-LIBRARY-VIEW-109 至 112）

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const MB = 1000 * 1000;

const templates: TemplateRow[] = [
  {
    id: "html",
    name: { en: "HTML", "zh-CN": "静态页面" },
    description: "",
    category: "page",
    unmaintained: false,
  },
];

const size = (totalBytes: number, extra: Partial<RowSize> = {}): RowSize => ({
  totalBytes,
  dependencyBytes: 0,
  dependencyDirs: [],
  unreadable: 0,
  ...extra,
});

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
    templateName: templates[0]?.name ?? null,
    port: null,
    autoClean: { enabled: false, days: null },
    lastUsedAt: NOW,
    lastOpenedAt: NOW - 60_000,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
    size: null,
    ...extra,
  };
}

function library(playgrounds: PlaygroundRow[], locale: "zh-CN" | "en"): LibraryState {
  return {
    locale,
    error: null,
    closeRequest: null,
    templates,
    runs: [],
    loaded: true,
    recentTemplates: [],
    tabs: [],
    activeTab: "library",
    libraryRoot: "~/Runyard",
    playgrounds,
  };
}

function setup(playgrounds: PlaygroundRow[], locale: "zh-CN" | "en" = "zh-CN") {
  const handlers: ((next: LibraryState) => void)[] = [];
  const call = vi.fn(async (method: string) =>
    method === "library.get" ? library(playgrounds, locale) : undefined,
  );
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale,
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const on = (event: string, handler: (next: LibraryState) => void) => {
    if (event === "library.changed") handlers.push(handler);
    return () => {};
  };
  const bridge = { bootstrap, call, on } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale={locale} theme="light" />);
  const push = (next: PlaygroundRow[]) =>
    act(() => {
      for (const handler of handlers) handler(library(next, locale));
    });
  return { push };
}

const tableName = (locale: "zh-CN" | "en") => (locale === "en" ? "Playgrounds" : "项目列表");

async function order(locale: "zh-CN" | "en" = "zh-CN"): Promise<string[]> {
  const table = await screen.findByRole("table", { name: tableName(locale) });
  return [...table.querySelectorAll("tbody tr[data-row-id]")].map(
    (r) => r.getAttribute("data-row-id") ?? "",
  );
}

const rows = () => [
  row("alpha", { size: size(900 * MB), lastUsedAt: NOW - 3000, createdAt: 1 }),
  row("beta", { size: size(20 * MB), lastUsedAt: NOW - 1000, createdAt: 3 }),
  row("gamma", { size: size(300 * MB), lastUsedAt: NOW - 2000, createdAt: 2 }),
];

const header = (name: string) => screen.findByRole("columnheader", { name });
const dropdown = () => screen.findByRole("button", { name: /^排序：/ });

describe("可点表头的样子", () => {
  it("[DESKTOP-LIBRARY-VIEW-109] 名称、大小、最近使用三个表头是带提示的按钮，其余表头不是", async () => {
    setup(rows());
    const table = await screen.findByRole("table", { name: "项目列表" });
    const name = within(await header("名称与备注")).getByRole("button");
    expect(name.getAttribute("title")).toBe("按“名称”排序");
    expect(
      within(await header("大小"))
        .getByRole("button")
        .getAttribute("title"),
    ).toBe("按“大小”排序");
    // 当前排序列的提示说点一下会变成什么
    expect(
      within(await header("最近使用"))
        .getByRole("button")
        .getAttribute("title"),
    ).toBe("最近使用：改为升序");
    for (const id of ["status", "template", "port", "retention"]) {
      expect(table.querySelector(`th[data-column="${id}"] button`)).toBeNull();
    }
  });

  it("[DESKTOP-LIBRARY-VIEW-109] 英文界面提示写 Sort by …", async () => {
    setup(rows(), "en");
    const name = await screen.findByRole("columnheader", { name: "Name and note" });
    expect(within(name).getByRole("button").getAttribute("title")).toBe("Sort by Name");
  });
});

describe("再点当前排序列切换方向", () => {
  it("[DESKTOP-LIBRARY-VIEW-110] 最近使用默认最新在前，再点变成最旧在前，箭头翻转，aria-sort 随之变化", async () => {
    const user = userEvent.setup();
    setup(rows());
    expect(await order()).toEqual(["beta", "gamma", "alpha"]);
    expect((await header("最近使用")).getAttribute("aria-sort")).toBe("descending");
    await user.click(within(await header("最近使用")).getByRole("button"));
    expect(await order()).toEqual(["alpha", "gamma", "beta"]);
    const recent = await header("最近使用");
    expect(recent.getAttribute("aria-sort")).toBe("ascending");
    expect(recent.querySelector("svg")?.getAttribute("class")).toMatch(/sortAscending/);
    await user.click(within(recent).getByRole("button"));
    expect((await header("最近使用")).getAttribute("aria-sort")).toBe("descending");
    expect(await order()).toEqual(["beta", "gamma", "alpha"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-110] 大小默认最大在前，名称默认 A 到 Z；换列时回到该列的默认方向", async () => {
    const user = userEvent.setup();
    setup(rows());
    await user.click(within(await header("大小")).getByRole("button"));
    expect(await order()).toEqual(["alpha", "gamma", "beta"]);
    expect((await header("大小")).getAttribute("aria-sort")).toBe("descending");
    await user.click(within(await header("大小")).getByRole("button"));
    expect(await order()).toEqual(["beta", "gamma", "alpha"]);
    expect((await header("大小")).getAttribute("aria-sort")).toBe("ascending");
    await user.click(within(await header("名称与备注")).getByRole("button"));
    expect(await order()).toEqual(["alpha", "beta", "gamma"]);
    expect((await header("名称与备注")).getAttribute("aria-sort")).toBe("ascending");
    await user.click(within(await header("名称与备注")).getByRole("button"));
    expect(await order()).toEqual(["gamma", "beta", "alpha"]);
    // 回到大小：不沿用名称的方向，也不沿用上次大小的方向
    await user.click(within(await header("大小")).getByRole("button"));
    expect((await header("大小")).getAttribute("aria-sort")).toBe("descending");
  });

  it("[DESKTOP-LIBRARY-VIEW-110] 升序时还在计算的大小仍排在最后", async () => {
    const user = userEvent.setup();
    setup([...rows(), row("delta")]);
    await user.click(within(await header("大小")).getByRole("button"));
    await user.click(within(await header("大小")).getByRole("button"));
    expect(await order()).toEqual(["beta", "gamma", "alpha", "delta"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-111] 排序下拉写出方向；在下拉里再选当前项同样切换方向，选别的项用默认方向", async () => {
    const user = userEvent.setup();
    setup(rows());
    expect((await dropdown()).textContent).toBe("排序：最近使用 ↓");
    await user.click(await dropdown());
    await user.click(await screen.findByRole("menuitemradio", { name: "最近使用 ↓" }));
    expect((await dropdown()).textContent).toBe("排序：最近使用 ↑");
    expect((await header("最近使用")).getAttribute("aria-sort")).toBe("ascending");
    await user.click(await dropdown());
    await user.click(await screen.findByRole("menuitemradio", { name: "名称" }));
    expect((await dropdown()).textContent).toBe("排序：名称 ↑");
    await user.click(await dropdown());
    await user.click(await screen.findByRole("menuitemradio", { name: "创建时间" }));
    expect((await dropdown()).textContent).toBe("排序：创建时间 ↓");
    expect(await order()).toEqual(["beta", "gamma", "alpha"]);
  });
});
