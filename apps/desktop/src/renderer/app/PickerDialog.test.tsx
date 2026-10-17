// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow, TemplateRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(cleanup);

const row = (id: string, category: TemplateRow["category"], extra: Partial<TemplateRow> = {}) => ({
  id,
  name: { en: id, "zh-CN": id },
  description: `${id} 的说明`,
  category,
  unmaintained: false,
  ...extra,
});

const templates: TemplateRow[] = [
  row("html", "page"),
  row("react19", "frontend"),
  row("vue3", "frontend"),
  row("hono", "service"),
  row("python", "script"),
];

const library = (extra: Partial<LibraryState> = {}): LibraryState => ({
  locale: "zh-CN",
  error: null,
  closeRequest: null,
  templates,
  runs: [],
  loaded: true,
  recentTemplates: [],
  tabs: [],
  activeTab: "library",
  libraryRoot: "~/Runyard",
  playgrounds: [],
  ...extra,
});

const existing: PlaygroundRow = {
  id: "a",
  name: "demo",
  path: "/lib/demo",
  kind: "static",
  state: "idle",
  active: false,
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
  missing: false,
};

function setup(state: LibraryState) {
  const call = vi.fn(async (method: string) => {
    if (method === "library.get") return state;
    return method === "playground.create" ? { ok: true } : undefined;
  });
  const listeners = new Map<string, () => void>();
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
    on: (event: string, listener: () => void) => {
      listeners.set(event, listener);
      return () => {};
    },
  } as unknown as DesktopBridge;
  render(<AppFrame bridge={bridge} locale="zh-CN" theme="system" />);
  return { call, press: () => act(() => listeners.get("picker.open")?.()) };
}

// 整个文件第一次画外壳和第一次角色查询要付一次冷启动的代价，慢机器上会挤占第一个用例的 5 秒时限
//（#219、#234 同类）；提前热身一遍，用例的断言和时限不变
beforeAll(async () => {
  setup(library());
  within(await screen.findByRole("dialog")).getAllByRole("option");
  cleanup();
});

describe("模板选择器", () => {
  it("[DESKTOP-CREATE-FLOW-01] 空资源库首次启动直接显示选择器，没有环境检查页，html 可以选择并创建", async () => {
    const user = userEvent.setup();
    const { call } = setup(library());
    const dialog = await screen.findByRole("dialog", { name: "选择模板" });
    expect(dialog).toBeTruthy();
    await user.keyboard("{Enter}");
    // 选择器关闭，换成新建弹窗；选择器自己什么都不创建
    expect(call).not.toHaveBeenCalledWith("playground.create", expect.anything());
    expect(screen.queryByRole("dialog", { name: "选择模板" })).toBeNull();
    const created = await screen.findByRole("dialog", { name: "新建项目" });
    expect(within(created).getByText("模板：html")).toBeTruthy();
    // 初始焦点在下一帧才落到名称框
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(within(created).getByRole("textbox", { name: "名称" })),
    );
    await user.keyboard("{Enter}");
    expect(call).toHaveBeenCalledWith("playground.create", {
      template: "html",
      name: "html-1",
      note: "",
      autoClean: null,
    });
  });

  it("有项目的资源库首次启动不自动弹出选择器", async () => {
    setup(library({ playgrounds: [existing] }));
    await screen.findByText("demo");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-02] 缺工具的模板照常显示、可以选中，选择器自己不调用任何检测", async () => {
    const user = userEvent.setup();
    const { call } = setup(library());
    await screen.findByRole("dialog");
    const option = screen.getByRole("option", { name: /python/ });
    expect(option.getAttribute("aria-disabled")).toBeNull();
    await user.click(option);
    await screen.findByRole("dialog", { name: "新建项目" });
    for (const [method] of call.mock.calls) {
      expect(method).toBe("library.get");
    }
  });

  it("[DESKTOP-CREATE-FLOW-03] 菜单的 ⌘N 通知到界面：选择器出现，焦点在搜索框里", async () => {
    const { press } = setup(library({ playgrounds: [existing] }));
    await screen.findByText("demo");
    expect(screen.queryByRole("dialog")).toBeNull();
    press();
    const search = await screen.findByRole("combobox", { name: "搜索模板" });
    expect(document.activeElement).toBe(search);
  });

  it("[DESKTOP-CREATE-FLOW-04] 第一个分组是“最近使用”，里面有 vue3，其后才是按类型的分组", async () => {
    const { press } = setup(library({ recentTemplates: ["vue3"], playgrounds: [existing] }));
    await screen.findByText("demo");
    press();
    const groups = await screen.findAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "最近使用",
      "页面",
      "前端",
      "脚本",
      "服务",
    ]);
    const first = groups[0] as HTMLElement;
    expect(
      within(first)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([expect.stringContaining("vue3")]);
  });

  it("[DESKTOP-CREATE-FLOW-05] 回车把选中的 react19 交给下一步，选择器关闭", async () => {
    const user = userEvent.setup();
    const { call } = setup(library());
    await screen.findByRole("dialog");
    // html 是第一行；页面分组一个，再往下两行是 react19
    await user.keyboard("{ArrowDown}{Enter}");
    expect(call).not.toHaveBeenCalledWith("playground.create", expect.anything());
    expect(screen.queryByRole("dialog", { name: "选择模板" })).toBeNull();
    const created = await screen.findByRole("dialog", { name: "新建项目" });
    // 弹窗里的模板是 react19：副标题写模板名，名称默认带模板标识
    expect(within(created).getByText("模板：react19")).toBeTruthy();
    expect((within(created).getByRole("textbox", { name: "名称" }) as HTMLInputElement).value).toBe(
      "react19-1",
    );
  });

  it("Esc 关闭选择器，不创建任何东西", async () => {
    const user = userEvent.setup();
    const { call } = setup(library());
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(call).not.toHaveBeenCalledWith("playground.create", expect.anything());
  });
});

describe("模板选择器的搜索", () => {
  const catalog: TemplateRow[] = [
    row("react19", "frontend", { name: { en: "React 19", "zh-CN": "React 19" } }),
    row("react18", "frontend", { name: { en: "React 18", "zh-CN": "React 18" } }),
    row("vue3", "frontend", {
      name: { en: "Vue 3", "zh-CN": "Vue 3" },
      description: { en: "Vue 3 with Vite", "zh-CN": "Vue 3 加 Vite" },
    }),
    row("hono", "service"),
    row("python", "script"),
  ];
  const withRecent = () => library({ templates: catalog, recentTemplates: ["vue3", "hono"] });
  const optionNames = () =>
    screen.getAllByRole("option").map((option) => option.textContent?.replace(/选择$/, ""));

  it("[DESKTOP-CREATE-FLOW-17] 输入 react 只剩两个 React 模板，没有“最近使用”，第一个被选中", async () => {
    const user = userEvent.setup();
    setup(withRecent());
    await screen.findByRole("dialog");
    expect(screen.getAllByRole("group")[0]?.getAttribute("aria-label")).toBe("最近使用");
    await user.keyboard("react");
    const names = optionNames();
    expect(names).toHaveLength(2);
    expect(names[0]).toContain("React 19");
    expect(names[1]).toContain("React 18");
    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual([
      "前端",
    ]);
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("[DESKTOP-CREATE-FLOW-17] 说明里的字也能搜到，不分大小写；高亮从上一次的行回到第一个结果", async () => {
    const user = userEvent.setup();
    setup(withRecent());
    await screen.findByRole("dialog");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.keyboard("VITE");
    expect(optionNames()).toHaveLength(1);
    expect(optionNames()[0]).toContain("Vue 3");
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("[DESKTOP-CREATE-FLOW-18] 搜索 hono 后回车，新建弹窗里的模板是 hono", async () => {
    const user = userEvent.setup();
    setup(withRecent());
    await screen.findByRole("dialog");
    await user.keyboard("hono{Enter}");
    const created = await screen.findByRole("dialog", { name: "新建项目" });
    expect(within(created).getByText("模板：hono")).toBeTruthy();
  });

  it("[DESKTOP-CREATE-FLOW-19] 搜索 rails 没有匹配并写明；清空后回到带“最近使用”的默认视图", async () => {
    const user = userEvent.setup();
    setup(withRecent());
    await screen.findByRole("dialog");
    await user.keyboard("rails");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("没有匹配的模板。")).toBeTruthy();
    await user.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}");
    expect(screen.queryByText("没有匹配的模板。")).toBeNull();
    expect(screen.getAllByRole("group")[0]?.getAttribute("aria-label")).toBe("最近使用");
  });
});

describe("模板选择器的分类栏和默认名称", () => {
  // 与规格 DESKTOP-CREATE-FLOW-22 同一份数据：页面 1、前端 3、脚本 3、服务 1、我的 2，最近用过其中 3 个
  const catalog: TemplateRow[] = [
    row("html", "page"),
    row("react19", "frontend"),
    row("react18", "frontend"),
    row("vue3", "frontend"),
    row("node-ts", "script"),
    row("python", "script"),
    row("go", "script"),
    row("hono", "service"),
    row("team-ui", "mine"),
    row("api-mock", "mine"),
  ];
  const recent = ["react19", "hono", "python"];
  const full = (extra: Partial<LibraryState> = {}) =>
    library({ templates: catalog, recentTemplates: recent, ...extra });
  const rail = () => screen.getByRole("toolbar", { name: "模板分类" });
  const railItems = () =>
    within(rail())
      .getAllByRole("button")
      .map((button) => button.textContent);
  const selectedRail = () =>
    within(rail())
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-current") === "true")
      .map((button) => button.textContent);
  const active = () =>
    screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true")
      ?.textContent;
  const scrolled: Element[] = [];
  beforeAll(() => {
    // jsdom 没有 scrollIntoView；记下被滚到顶部的元素，证明点分类真的把那个分组滚到了列表顶
    Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) {
      if (typeof arg === "object" && arg !== null && (arg as { block?: string }).block === "start")
        scrolled.push(this);
    };
  });
  afterEach(() => {
    scrolled.length = 0;
  });

  it("[DESKTOP-CREATE-FLOW-22] 默认视图：最近使用 3、全部 10、页面 1、前端 3、脚本 3、服务 1、我的 2，没有全栈，选中最近使用", async () => {
    setup(full());
    await screen.findByRole("dialog");
    expect(railItems()).toEqual([
      "最近使用3",
      "全部10",
      "页面1",
      "前端3",
      "脚本3",
      "服务1",
      "我的2",
    ]);
    expect(selectedRail()).toEqual(["最近使用3"]);
  });

  it("[DESKTOP-CREATE-FLOW-22] 没有最近使用时栏里没有这一项，第一个类型选中", async () => {
    setup(full({ recentTemplates: [] }));
    await screen.findByRole("dialog");
    expect(railItems()[0]).toBe("全部10");
    expect(railItems()).not.toContain("最近使用0");
    expect(selectedRail()).toEqual(["页面1"]);
  });

  it("[DESKTOP-CREATE-FLOW-23] 点“前端”：列表滚到前端分组，高亮它的第一个模板；焦点仍在搜索框，列表没有被过滤；点“全部”回到开头", async () => {
    const user = userEvent.setup();
    setup(full());
    await screen.findByRole("dialog");
    const optionCount = screen.getAllByRole("option").length;
    await user.click(within(rail()).getByRole("button", { name: /^前端/ }));
    expect(selectedRail()).toEqual(["前端3"]);
    expect(active()).toContain("react19");
    const frontend = screen.getByRole("group", { name: "前端" });
    const highlighted = screen
      .getAllByRole("option")
      .find((option) => option.getAttribute("aria-selected") === "true");
    expect(frontend.contains(highlighted ?? null)).toBe(true);
    expect(scrolled.at(-1)?.parentElement).toBe(frontend);
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "搜索模板" }));
    expect(screen.getAllByRole("option")).toHaveLength(optionCount);
    await user.click(within(rail()).getByRole("button", { name: /^全部/ }));
    expect(selectedRail()).toEqual(["最近使用3"]);
    expect(scrolled.at(-1)?.parentElement).toBe(screen.getByRole("group", { name: "最近使用" }));
  });

  it("[DESKTOP-CREATE-FLOW-24] 方向键越过分组边界，选中的分类跟着变；按回车进入新建弹窗", async () => {
    const user = userEvent.setup();
    setup(full());
    await screen.findByRole("dialog");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selectedRail()).toEqual(["最近使用3"]);
    await user.keyboard("{ArrowDown}");
    expect(selectedRail()).toEqual(["页面1"]);
    await user.keyboard("{ArrowUp}");
    expect(selectedRail()).toEqual(["最近使用3"]);
    await user.keyboard("{End}");
    expect(selectedRail()).toEqual(["我的2"]);
    await user.keyboard("{Enter}");
    const created = await screen.findByRole("dialog", { name: "新建项目" });
    expect(within(created).getByText("模板：api-mock")).toBeTruthy();
  });

  it("[DESKTOP-CREATE-FLOW-25] 搜索 react：栏里只剩 全部 2 和 前端 2；清空后回到默认", async () => {
    const user = userEvent.setup();
    setup(full({ recentTemplates: ["vue3"] }));
    await screen.findByRole("dialog");
    await user.keyboard("react");
    expect(railItems()).toEqual(["全部2", "前端2"]);
    await user.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}");
    expect(railItems()).toEqual([
      "最近使用1",
      "全部10",
      "页面1",
      "前端3",
      "脚本3",
      "服务1",
      "我的2",
    ]);
  });

  it("[DESKTOP-CREATE-FLOW-26] 搜索 rails：栏里只有点不了的“全部 0”，列表写明没有匹配", async () => {
    const user = userEvent.setup();
    setup(full());
    await screen.findByRole("dialog");
    await user.keyboard("rails");
    expect(railItems()).toEqual(["全部0"]);
    expect(within(rail()).getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("没有匹配的模板。")).toBeTruthy();
  });

  it("[DESKTOP-CREATE-FLOW-27] 底部写默认名称：已有 react19-1、react19-3 时 react19 是 react19-4，移到 hono 变成 hono-1；没有结果时不写", async () => {
    const user = userEvent.setup();
    const names = ["react19-1", "react19-3"];
    const { press } = setup(
      full({
        recentTemplates: [],
        playgrounds: names.map((name) => ({ ...existing, id: name, name })),
      }),
    );
    await screen.findAllByText("react19-3");
    press();
    await screen.findByRole("dialog");
    const footer = () => document.querySelector("[data-default-name]")?.parentElement?.textContent;
    expect(footer()).toContain("默认名称html-1");
    await user.keyboard("{ArrowDown}");
    expect(active()).toContain("react19");
    expect(footer()).toContain("默认名称react19-4");
    await user.keyboard("hono");
    expect(footer()).toContain("默认名称hono-1");
    await user.keyboard("zzz");
    expect(document.querySelector("[data-default-name]")).toBeNull();
    expect(screen.queryByText("默认名称")).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-28] 点分类后按回车进入新建弹窗，模板是点击后高亮的那一行；Tab 不把焦点移到分类栏", async () => {
    const user = userEvent.setup();
    setup(full());
    await screen.findByRole("dialog");
    const search = screen.getByRole("combobox", { name: "搜索模板" });
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(search);
    await user.click(within(rail()).getByRole("button", { name: /^脚本/ }));
    expect(document.activeElement).toBe(search);
    await user.keyboard("{Enter}");
    const created = await screen.findByRole("dialog", { name: "新建项目" });
    expect(within(created).getByText("模板：node-ts")).toBeTruthy();
  });
});
