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
  recentTemplates: [],
  tabs: [],
  activeTab: "library",
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
};

function setup(state: LibraryState) {
  const call = vi.fn(async (method: string) => (method === "library.get" ? state : undefined));
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
    expect(call).toHaveBeenCalledWith("playground.create", "html");
    expect(screen.queryByRole("dialog")).toBeNull();
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
    expect(call).toHaveBeenCalledWith("playground.create", "python");
    for (const [method] of call.mock.calls) {
      expect(["library.get", "playground.create"]).toContain(method);
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
    expect(call).toHaveBeenCalledWith("playground.create", "react19");
    expect(screen.queryByRole("dialog")).toBeNull();
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
