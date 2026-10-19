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

// 大小列、悬停提示、按大小排序和侧栏合计（规格 DESKTOP-LIBRARY-VIEW-69 至 77）

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const MB = 1000 * 1000;
const GB = 1000 * MB;

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

async function sizeCell(id: string, locale: "zh-CN" | "en" = "zh-CN"): Promise<HTMLElement> {
  const table = await screen.findByRole("table", { name: tableName(locale) });
  const cell = table.querySelector(`tr[data-row-id="${id}"] td[data-column="size"]`);
  if (cell === null) throw new Error(`no size cell for ${id}`);
  return cell as HTMLElement;
}

async function order(locale: "zh-CN" | "en" = "zh-CN"): Promise<string[]> {
  const table = await screen.findByRole("table", { name: tableName(locale) });
  return [...table.querySelectorAll("tbody tr[data-row-id]")].map(
    (r) => r.getAttribute("data-row-id") ?? "",
  );
}

const footer = (text: string) => screen.findByText(text);

describe("侧栏底部的合计", () => {
  const twenty = (extra: (index: number) => Partial<PlaygroundRow> = () => ({})) =>
    Array.from({ length: 20 }, (_, index) =>
      row(`p${index}`, {
        size: size(index === 0 ? 3_113_851_289 - 19 * 100 : 100),
        ...extra(index),
      }),
    );

  it("[DESKTOP-LIBRARY-VIEW-69] 中文写“20 个项目 · 共 3.1 GB”，英文写“20 playgrounds · 3.1 GB total”", async () => {
    setup(twenty(), "zh-CN");
    expect(await footer("20 个项目 · 共 3.1 GB")).toBeDefined();
    cleanup();
    setup(twenty(), "en");
    expect(await footer("20 playgrounds · 3.1 GB total")).toBeDefined();
  });

  it("[DESKTOP-LIBRARY-VIEW-70] 还有项目在计算时写“正在计算大小”，算完不用刷新就换成合计", async () => {
    const pending = twenty((index) => (index < 3 ? { size: null } : {}));
    const { push } = setup(pending);
    expect(await footer("20 个项目 · 正在计算大小")).toBeDefined();
    await push(twenty());
    expect(await footer("20 个项目 · 共 3.1 GB")).toBeDefined();
  });

  it("[DESKTOP-LIBRARY-VIEW-71] 移到废纸篓后不用刷新，合计和个数跟着变", async () => {
    const all = twenty((index) => (index === 1 ? { size: size(412 * MB) } : {}));
    const { push } = setup(all);
    expect(await footer("20 个项目 · 共 3.5 GB")).toBeDefined();
    await push(all.filter((r) => r.id !== "p1"));
    expect(await footer("19 个项目 · 共 3.1 GB")).toBeDefined();
  });

  it("[DESKTOP-LIBRARY-VIEW-72] 没有项目时只写“0 个项目”，没有“共”", async () => {
    setup([]);
    expect(await footer("0 个项目")).toBeDefined();
    expect(screen.queryByText(/共/)).toBeNull();
  });
});

describe("大小列", () => {
  it("[DESKTOP-LIBRARY-VIEW-73] 写法 0 B、900 B、1.5 KB、812.4 MB、2 GB（中英文相同），数字右对齐", async () => {
    for (const locale of ["zh-CN", "en"] as const) {
      cleanup();
      setup(
        [
          row("a", { size: size(0) }),
          row("b", { size: size(900) }),
          row("c", { size: size(1536) }),
          row("d", { size: size(812_400_000) }),
          row("e", { size: size(2 * GB) }),
        ],
        locale,
      );
      const texts = await Promise.all(
        ["a", "b", "c", "d", "e"].map(async (id) => (await sizeCell(id, locale)).textContent),
      );
      expect(texts).toEqual(["0 B", "900 B", "1.5 KB", "812.4 MB", "2 GB"]);
      expect((await sizeCell("a", locale)).getAttribute("data-align")).toBe("end");
    }
  });

  it("[DESKTOP-LIBRARY-VIEW-74] 计算中、找不到文件夹、不完整；悬停最后一行写没计入的处数", async () => {
    const user = userEvent.setup();
    setup([
      row("calc"),
      row("gone", { missing: true }),
      row("partial", { size: size(812_400_000, { unreadable: 2 }) }),
    ]);
    expect((await sizeCell("calc")).textContent).toBe("计算中");
    expect((await sizeCell("gone")).textContent).toBe("—");
    const partial = await sizeCell("partial");
    expect(partial.textContent).toBe("≥ 812.4 MB");
    await user.hover(within(partial).getByText("≥ 812.4 MB"));
    expect(await screen.findByText("有 2 处没有权限读取，没有计入")).toBeDefined();
  });

  it("[DESKTOP-LIBRARY-VIEW-75] 悬停看依赖占多少；没有依赖目录写“没有依赖目录”；英文写法", async () => {
    const user = userEvent.setup();
    setup([
      row("react-counter", {
        size: size(186_300_000, { dependencyBytes: 181_900_000, dependencyDirs: ["node_modules"] }),
      }),
      row("go-channels", { size: size(24_000) }),
    ]);
    const react = await sizeCell("react-counter");
    await user.hover(within(react).getByText("186.3 MB"));
    expect(await screen.findByText("依赖 181.9 MB（node_modules）")).toBeDefined();
    expect(await screen.findByText("其余 4.4 MB")).toBeDefined();
    await user.unhover(within(react).getByText("186.3 MB"));
    const go = await sizeCell("go-channels");
    await user.hover(within(go).getByText("24 KB"));
    expect(await screen.findByText("没有依赖目录")).toBeDefined();
    cleanup();
    setup(
      [
        row("react-counter", {
          size: size(186_300_000, {
            dependencyBytes: 181_900_000,
            dependencyDirs: ["node_modules"],
          }),
        }),
      ],
      "en",
    );
    const en = await sizeCell("react-counter", "en");
    await user.hover(within(en).getByText("186.3 MB"));
    expect(await screen.findByText("Dependencies 181.9 MB (node_modules)")).toBeDefined();
    expect(await screen.findByText("Everything else 4.4 MB")).toBeDefined();
  });
});

describe("按大小排序", () => {
  const rows = () => [
    row("zeta", { state: "ready", active: true, size: size(10 * MB) }),
    row("alpha", { size: size(900 * MB) }),
    row("beta", { size: size(20 * MB) }),
    row("gamma"),
  ];

  it("[DESKTOP-LIBRARY-VIEW-76] 点表头“大小”：下拉写“排序：大小”，表头旁有向下的箭头，运行中的在最前，还在计算的在最后", async () => {
    const user = userEvent.setup();
    setup(rows());
    const header = await screen.findByRole("columnheader", { name: "大小" });
    expect(header.querySelector("svg")).toBeNull();
    await user.click(within(header).getByRole("button", { name: "大小" }));
    expect(await screen.findByRole("button", { name: /排序：大小/ })).toBeDefined();
    expect(
      within(await screen.findByRole("columnheader", { name: "大小" }))
        .getByRole("button")
        .querySelector("svg"),
    ).not.toBeNull();
    expect(await order()).toEqual(["zeta", "alpha", "beta", "gamma"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-77] 按最近使用排序时数字实时变化、行不动；改为按大小排序才按新数字排位", async () => {
    const user = userEvent.setup();
    const before = [
      row("react-counter", { size: size(186_300_000), lastOpenedAt: NOW }),
      row("other", { size: size(300 * MB), lastOpenedAt: NOW - 60_000, lastUsedAt: NOW - 60_000 }),
    ];
    const { push } = setup(before);
    expect((await sizeCell("react-counter")).textContent).toBe("186.3 MB");
    const after = [
      row("react-counter", { size: size(412 * MB), lastOpenedAt: NOW }),
      before[1] as PlaygroundRow,
    ];
    await push(after);
    expect((await sizeCell("react-counter")).textContent).toBe("412 MB");
    expect(await order()).toEqual(["react-counter", "other"]);
    await user.click(
      within(await screen.findByRole("columnheader", { name: "大小" })).getByRole("button"),
    );
    expect(await order()).toEqual(["react-counter", "other"]);
    await push([
      row("react-counter", { size: size(100 * MB), lastOpenedAt: NOW }),
      before[1] as PlaygroundRow,
    ]);
    expect(await order()).toEqual(["other", "react-counter"]);
  });
});
