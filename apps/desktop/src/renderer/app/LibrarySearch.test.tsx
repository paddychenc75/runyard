// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow, TemplateRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(cleanup);

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const MINUTE = 60 * 1000;

const template = (
  id: string,
  category: TemplateRow["category"],
  name: string = id,
): TemplateRow => ({
  id,
  name: { en: name, "zh-CN": name },
  description: `${id} 的说明`,
  category,
  unmaintained: false,
});

const templates: TemplateRow[] = [
  template("html", "page", "静态页面"),
  template("react19", "frontend", "React 19"),
  template("hono", "service", "Hono"),
  template("go", "script", "Go"),
  template("python", "script", "Python"),
];

function row(id: string, extra: Partial<PlaygroundRow> = {}): PlaygroundRow {
  const templateId = extra.templateId ?? "html";
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
    templateId,
    templateName: templates.find((candidate) => candidate.id === templateId)?.name ?? null,
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

function library(playgrounds: PlaygroundRow[]): LibraryState {
  return {
    locale: "zh-CN",
    error: null,
    closeRequest: null,
    templates,
    recentTemplates: [],
    tabs: [],
    activeTab: "library",
    libraryRoot: "~/Runyard",
    playgrounds,
  };
}

function setup(state: LibraryState) {
  const call = vi.fn(async (method: string) => (method === "library.get" ? state : undefined));
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
  const on = (_event: string, handler: (next: LibraryState) => void) => {
    handlers.push(handler);
    return () => {};
  };
  const bridge = { bootstrap, call, on } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="light" />);
  return { call, push };
}

/** 列表里现在有哪些项目，按显示顺序 */
async function names(): Promise<string[]> {
  const table = await screen.findByRole("table", { name: "项目列表" });
  return within(table)
    .getAllByRole("row")
    .flatMap((r) => {
      const id = r.getAttribute("data-row-id");
      return id === null ? [] : [id];
    });
}

const searchBox = () => screen.findByRole("textbox", { name: "搜索项目" });

async function choose(user: ReturnType<typeof userEvent.setup>, button: RegExp, item: string) {
  await user.click(await screen.findByRole("button", { name: button }));
  await user.click(await screen.findByRole("menuitemradio", { name: item }));
}

const search4 = () =>
  library([
    row("pricing-1", { note: "价格表" }),
    row("landing-hero", { note: "pricing table layout test" }),
    row("hono-1", { templateId: "hono" }),
    row("go-channels", { templateId: "go" }),
  ]);

describe("资源库搜索", () => {
  it("[DESKTOP-LIBRARY-VIEW-13] 按名称、备注和模板匹配，不分大小写", async () => {
    const user = userEvent.setup();
    setup(search4());
    await user.type(await searchBox(), "Pricing");
    expect((await names()).sort()).toEqual(["landing-hero", "pricing-1"]);
    await user.clear(await searchBox());
    await user.type(await searchBox(), "hono");
    expect(await names()).toEqual(["hono-1"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-13] 不按标签匹配：搜索只看名称、备注、模板", async () => {
    const user = userEvent.setup();
    setup(search4());
    // 模板说明（“hono 的说明”）不在搜索范围里
    await user.type(await searchBox(), "的说明");
    expect(await screen.findByText("没有找到“的说明”")).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-14] 焦点在表格上按 ⌘F，焦点进搜索框", async () => {
    const user = userEvent.setup();
    setup(search4());
    const table = await screen.findByRole("table", { name: "项目列表" });
    table.focus();
    expect(document.activeElement).not.toBe(await searchBox());
    await user.keyboard("{Meta>}f{/Meta}");
    expect(document.activeElement).toBe(await searchBox());
  });

  it("[DESKTOP-LIBRARY-VIEW-15] 清除按钮和 Esc 都清空搜索并恢复完整列表，概况不再写结果数", async () => {
    const user = userEvent.setup();
    setup(search4());
    await user.type(await searchBox(), "hono");
    expect(await names()).toEqual(["hono-1"]);
    await user.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(((await searchBox()) as HTMLInputElement).value).toBe("");
    expect(await names()).toHaveLength(4);
    expect(screen.queryByText(/个结果/)).toBeNull();
    await user.type(await searchBox(), "hono{Escape}");
    expect(((await searchBox()) as HTMLInputElement).value).toBe("");
    expect(await names()).toHaveLength(4);
  });

  it("[DESKTOP-LIBRARY-VIEW-16] 20 个项目里匹配 3 个，概况写“3 个结果 · 共 20 个项目”", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 20 }, (_, index) =>
      row(index < 3 ? `match-${index}` : `other-${index}`),
    );
    setup(library(rows));
    expect(await screen.findByText(/^20 个项目 · 0 个正在运行/)).toBeTruthy();
    await user.type(await searchBox(), "match");
    expect(await screen.findByText(/^3 个结果 · 共 20 个项目/)).toBeTruthy();
  });
});

// 每条用例要多次打开下拉浮层，Windows 的 CI 机器上浮层挂载很慢（同 Menu.test 的做法，PR #224）
describe("类型、状态筛选与排序", { timeout: 20_000 }, () => {
  const mixed = () =>
    library([
      row("site", { templateId: "html" }),
      row("react-a", { templateId: "react19" }),
      row("react-b", { templateId: "react19", note: "react 练习" }),
      row("script-a", { templateId: "python", kind: "oneshot" }),
    ]);

  it("[DESKTOP-LIBRARY-VIEW-17] 类型选“脚本”只剩脚本类项目，按钮写“类型：脚本”", async () => {
    const user = userEvent.setup();
    setup(mixed());
    await choose(user, /^类型：全部/, "脚本");
    expect(await names()).toEqual(["script-a"]);
    expect(screen.getByRole("button", { name: /^类型：脚本/ })).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-18] 状态依次选“运行中”“有问题”", async () => {
    const user = userEvent.setup();
    setup(
      library([
        row("run-a", { state: "ready", active: true }),
        row("install-b", { state: "installing", active: true }),
        row("script-done", { state: "finished", kind: "oneshot" }),
        row("gone", { missing: true }),
        row("crash", { state: "crashed" }),
        row("idle-c"),
      ]),
    );
    await choose(user, /^状态：全部/, "运行中");
    expect((await names()).sort()).toEqual(["install-b", "run-a"]);
    await choose(user, /^状态：运行中/, "有问题");
    expect((await names()).sort()).toEqual(["crash", "gone"]);
    await choose(user, /^状态：有问题/, "已停止");
    expect((await names()).sort()).toEqual(["idle-c", "script-done"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-19] 类型与搜索叠加，清除搜索后类型筛选保留", async () => {
    const user = userEvent.setup();
    setup(mixed());
    await choose(user, /^类型：全部/, "前端");
    await user.type(await searchBox(), "练习");
    expect(await names()).toEqual(["react-b"]);
    await user.click(screen.getByRole("button", { name: "清除搜索" }));
    expect((await names()).sort()).toEqual(["react-a", "react-b"]);
    expect(screen.getByRole("button", { name: /^类型：前端/ })).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-20] 排序选“名称”，运行中的 zeta 仍在第一行，其余按名称", async () => {
    const user = userEvent.setup();
    setup(
      library([
        row("zeta", { state: "ready", active: true, lastOpenedAt: 1 }),
        row("beta", { lastOpenedAt: NOW }),
        row("alpha", { lastOpenedAt: 2 }),
      ]),
    );
    expect(await names()).toEqual(["zeta", "beta", "alpha"]);
    await choose(user, /^排序：最近打开/, "名称");
    expect(await names()).toEqual(["zeta", "alpha", "beta"]);
    await choose(user, /^排序：名称/, "创建时间");
    expect(screen.getByRole("button", { name: /^排序：创建时间/ })).toBeTruthy();
  });

  it("排序选“创建时间”：新建的在前，运行中的仍在最前", async () => {
    const user = userEvent.setup();
    setup(
      library([
        row("old", { createdAt: 10 }),
        row("new", { createdAt: 30 }),
        row("running-old", { createdAt: 5, state: "ready", active: true }),
        row("mid", { createdAt: 20 }),
      ]),
    );
    await choose(user, /^排序：最近打开/, "创建时间");
    expect(await names()).toEqual(["running-old", "new", "mid", "old"]);
  });
});

describe("侧栏固定筛选与计数", () => {
  const twenty = () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      row(`p-${String(index).padStart(2, "0")}`, {
        autoClean: index < 4 ? { enabled: true, days: 30 } : { enabled: false, days: null },
        createdBy: index >= 14 ? { kind: "agent", agent: "Claude Code" } : { kind: "user" },
      }),
    );
    return library(rows);
  };

  it("[DESKTOP-LIBRARY-VIEW-22] 全部 20、已保留 16、自动清理 4，两项互补", async () => {
    setup(twenty());
    for (const [name, count] of [
      ["全部", "20"],
      ["已保留", "16"],
      ["自动清理", "4"],
    ] as const) {
      const item = await screen.findByRole("button", { name: new RegExp(`^${name}\\s*${count}$`) });
      expect((item as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("[DESKTOP-LIBRARY-VIEW-21] 点“智能体创建”只剩 6 个，页标题换成它，选中项高亮，数字是 6", async () => {
    const user = userEvent.setup();
    setup(twenty());
    const item = await screen.findByRole("button", { name: /^智能体创建\s*6$/ });
    await user.click(item);
    expect(await names()).toHaveLength(6);
    expect(screen.getByRole("heading", { level: 1, name: "智能体创建" })).toBeTruthy();
    expect(item.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText(/^6 个结果 · 共 20 个项目/)).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-23] 新项目出现时不用刷新，“全部”和“智能体创建”各加 1", async () => {
    const { push } = setup(twenty());
    await screen.findByRole("button", { name: /^智能体创建\s*6$/ });
    const next = twenty();
    next.playgrounds.push(row("demo", { createdBy: { kind: "agent", agent: "Claude Code" } }));
    await push(next);
    expect(await screen.findByRole("button", { name: /^全部\s*21$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^智能体创建\s*7$/ })).toBeTruthy();
  });

  it("“长期未使用”仍然点不了", async () => {
    setup(twenty());
    const unused = await screen.findByRole("button", { name: /^长期未使用/ });
    expect((unused as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("搜索没有结果", { timeout: 20_000 }, () => {
  const twenty = () => library(Array.from({ length: 20 }, (_, index) => row(`p-${index}`)));

  it("[DESKTOP-LIBRARY-VIEW-24] 搜 websocket：标题、说明、清除搜索、新建按钮，概况写“0 个结果 · 共 20 个项目”", async () => {
    const user = userEvent.setup();
    setup(twenty());
    await user.type(await searchBox(), "websocket");
    expect(await screen.findByText("没有找到“websocket”")).toBeTruthy();
    expect(screen.getByText("名称、备注和模板里都没有这个词。")).toBeTruthy();
    // 顶栏搜索框里的清除钮和画面里的“清除搜索”同名，只看内容区的
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("button", { name: "清除搜索" })).toBeTruthy();
    expect(main.getByRole("button", { name: "新建项目，名称用“websocket”" })).toBeTruthy();
    expect(screen.getByText(/^0 个结果 · 共 20 个项目/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-25] 点新建按钮，在选择器里选 html 回车，新建弹窗的名称是 websocket", async () => {
    const user = userEvent.setup();
    setup(twenty());
    await user.type(await searchBox(), "websocket");
    await user.click(await screen.findByRole("button", { name: "新建项目，名称用“websocket”" }));
    await screen.findByRole("dialog", { name: "选择模板" });
    // html 是页面分组里唯一的一个，第一行
    await user.keyboard("html");
    await user.keyboard("{Enter}");
    const created = await screen.findByRole("dialog", { name: "新建项目" });
    expect((within(created).getByRole("textbox", { name: "名称" }) as HTMLInputElement).value).toBe(
      "websocket",
    );
  });

  it("[DESKTOP-LIBRARY-VIEW-26] 搜 Hello World（大写和空格）没有结果时只有“清除搜索”，没有新建按钮", async () => {
    const user = userEvent.setup();
    setup(twenty());
    await user.type(await searchBox(), "Hello World");
    await screen.findByText("没有找到“Hello World”");
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("button", { name: "清除搜索" })).toBeTruthy();
    expect(main.queryByRole("button", { name: /^新建项目，名称用/ })).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-26] 搜索文字已被占用的项目名占着时，同样不给新建按钮", async () => {
    const user = userEvent.setup();
    setup(library([row("taken", { note: "x" })]));
    await user.click(await screen.findByRole("button", { name: /^状态：全部/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: "有问题" }));
    await user.type(await searchBox(), "taken");
    // 名称 taken 匹配但被状态筛掉：没有结果，而 taken 是已有的名字
    await screen.findByText("没有找到“taken”");
    expect(screen.queryByRole("button", { name: /^新建项目，名称用/ })).toBeNull();
  });

  it("只有筛选没有搜索文字时，没有结果画面给“清除筛选”", async () => {
    const user = userEvent.setup();
    setup(twenty());
    await choose(user, /^状态：全部/, "有问题");
    await screen.findByText("没有符合条件的项目");
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(await names()).toHaveLength(20);
  });

  it("没有项目的资源库仍是“还没有项目”的空状态，没有下拉", async () => {
    setup(library([]));
    expect(await screen.findByText("还没有项目")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^类型：/ })).toBeNull();
  });
});

describe("页概况与资源库位置", () => {
  it("[DESKTOP-LIBRARY-VIEW-27] 标题下写项目数、运行数和存放位置，侧栏底部写位置和项目数", async () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, index) =>
        row(`run-${index}`, { state: "ready", active: true }),
      ),
      ...Array.from({ length: 16 }, (_, index) => row(`stop-${index}`)),
    ];
    setup(library(rows));
    expect(await screen.findByText("20 个项目 · 4 个正在运行 · 存放在 ~/Runyard")).toBeTruthy();
    const footer = screen.getByText("20 个项目", { selector: "div" });
    expect(footer.parentElement?.textContent).toContain("~/Runyard");
  });
});
