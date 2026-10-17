// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateResult, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow, TemplateRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";

afterEach(cleanup);

const template = (id: string, category: TemplateRow["category"]): TemplateRow => ({
  id,
  name: { en: id, "zh-CN": id },
  description: `${id} 的说明`,
  category,
  unmaintained: false,
});

const project = (name: string): PlaygroundRow => ({
  id: name,
  name,
  path: `/lib/${name}`,
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
});

function library(names: string[]): LibraryState {
  return {
    locale: "zh-CN",
    error: null,
    closeRequest: null,
    templates: [template("html", "page"), template("react19", "frontend")],
    runs: [],
    loaded: true,
    recentTemplates: [],
    tabs: [],
    activeTab: "library",
    libraryRoot: "~/Runyard",
    playgrounds: names.map(project),
  };
}

const user = userEvent.setup();

// 打开选择器、选 react19，停在新建弹窗上
async function openCreateDialog(names: string[], result: CreateResult = { ok: true }) {
  const state = library(names);
  const call = vi.fn(async (method: string, ..._args: unknown[]) => {
    if (method === "library.get") return state;
    return method === "playground.create" ? result : undefined;
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
  if (names.length > 0) {
    await screen.findByText(names[0] ?? "");
    act(() => listeners.get("picker.open")?.());
  }
  await user.click(await screen.findByRole("option", { name: /react19/ }));
  const dialog = await screen.findByRole("dialog", { name: "新建项目" });
  const nameBox = within(dialog).getByRole("textbox", { name: "名称" }) as HTMLInputElement;
  // 初始焦点在下一帧才落到名称框；之后直接按回车才有效
  await vi.waitFor(() => expect(document.activeElement).toBe(nameBox));
  return {
    call,
    dialog,
    nameBox,
    created: () => call.mock.calls.filter((c) => c[0] === "playground.create"),
  };
}

describe("新建弹窗", () => {
  it("[DESKTOP-CREATE-FLOW-06] 已有 react19-1 和 react19-3：名称默认 react19-4 且被全选", async () => {
    const { nameBox } = await openCreateDialog(["react19-1", "react19-3"]);
    expect(nameBox.value).toBe("react19-4");
    expect(document.activeElement).toBe(nameBox);
    expect([nameBox.selectionStart, nameBox.selectionEnd]).toEqual([0, 9]);
  });

  it("名称下提示文件夹：资源库路径加名称", async () => {
    const { dialog } = await openCreateDialog([]);
    expect(within(dialog).getByText("~/Runyard/react19-1")).toBeTruthy();
  });

  it("[DESKTOP-CREATE-FLOW-07] 自动清理默认关闭，天数选择收起，备注为空", async () => {
    const { dialog } = await openCreateDialog([]);
    expect(
      within(dialog).getByRole("switch", { name: "自动清理" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(within(dialog).queryByRole("group", { name: "多久没打开后清理" })).toBeNull();
    expect((within(dialog).getByRole("textbox", { name: /备注/ }) as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("[DESKTOP-CREATE-FLOW-08] 打开自动清理出现 7、30、90 天和自定义；选 7 天创建，天数和备注交给主进程", async () => {
    const { dialog, created } = await openCreateDialog([]);
    await user.click(within(dialog).getByRole("switch", { name: "自动清理" }));
    const group = within(dialog).getByRole("group", { name: "多久没打开后清理" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["7 天", "30 天", "90 天", "自定义"]);
    // 默认选 30 天，并说明清理规则
    expect(within(group).getByRole("button", { name: "30 天" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await user.click(within(group).getByRole("button", { name: "7 天" }));
    await user.type(within(dialog).getByRole("textbox", { name: /备注/ }), "price page");
    await user.click(within(dialog).getByRole("button", { name: "创建并运行" }));
    expect(created()[0]?.[1]).toEqual({
      template: "react19",
      name: "react19-1",
      note: "price page",
      autoClean: 7,
    });
  });

  it("自定义天数：只认大于 0 的整数，不对就不能创建，填对后按填的天数创建", async () => {
    const { dialog, created } = await openCreateDialog([]);
    await user.click(within(dialog).getByRole("switch", { name: "自动清理" }));
    await user.click(within(dialog).getByRole("button", { name: "自定义" }));
    const days = within(dialog).getByRole("textbox", { name: "自定义天数" });
    await user.type(days, "0");
    expect(within(dialog).getByText("请填大于 0 的整数")).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(created()).toHaveLength(0);
    await user.clear(days);
    await user.type(days, "14");
    await user.keyboard("{Enter}");
    expect(created()[0]?.[1]).toMatchObject({ autoClean: 14 });
  });

  it("[DESKTOP-CREATE-FLOW-09] 重名：名称下显示“这个名字已被占用”，没有创建，弹窗不关闭", async () => {
    const { dialog, nameBox, created } = await openCreateDialog(["demo"]);
    await user.clear(nameBox);
    await user.type(nameBox, "demo{Enter}");
    expect(within(dialog).getByText("这个名字已被占用")).toBeTruthy();
    expect(created()).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "新建项目" })).toBeTruthy();
  });

  it("[DESKTOP-CREATE-FLOW-10] 不合法的字符：名称下显示行内错误，没有创建", async () => {
    const { dialog, nameBox, created } = await openCreateDialog([]);
    await user.clear(nameBox);
    await user.type(nameBox, "My App{Enter}");
    expect(within(dialog).getByText(/只能用小写字母、数字和连字符/)).toBeTruthy();
    expect(nameBox.getAttribute("aria-invalid")).toBe("true");
    expect(created()).toHaveLength(0);
  });

  it("[DESKTOP-CREATE-FLOW-11] 全部默认值直接回车：按默认名称创建，弹窗关闭，没有自动清理（已保留）", async () => {
    const { nameBox, created } = await openCreateDialog(["react19-1", "react19-3"]);
    expect(document.activeElement).toBe(nameBox);
    await user.keyboard("{Enter}");
    expect(created()).toHaveLength(1);
    expect(created()[0]?.[1]).toEqual({
      template: "react19",
      name: "react19-4",
      note: "",
      autoClean: null,
    });
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "新建项目" })).toBeNull());
  });

  it("主进程拒绝创建（重名抢先、保留名等）：错误显示在名称下，弹窗不关闭，改名后错误消失", async () => {
    const { dialog, nameBox } = await openCreateDialog([], {
      ok: false,
      error: { code: "NAME_EXISTS", params: { kind: "playground", name: "react19-1" } },
    });
    await user.keyboard("{Enter}");
    expect(await within(dialog).findByText("这个名字已被占用")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "新建项目" })).toBeTruthy();
    await user.type(nameBox, "x");
    expect(within(dialog).queryByText("这个名字已被占用")).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-13] 取消：弹窗关闭，没有创建任何项目", async () => {
    const { dialog, created } = await openCreateDialog([]);
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "新建项目" })).toBeNull();
    expect(created()).toHaveLength(0);
  });

  it("Esc 也是取消", async () => {
    const { created } = await openCreateDialog([]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "新建项目" })).toBeNull();
    expect(created()).toHaveLength(0);
  });

  it("“换一个模板”回到选择器", async () => {
    const { dialog } = await openCreateDialog([]);
    await user.click(within(dialog).getByRole("button", { name: "换一个模板" }));
    expect(await screen.findByRole("dialog", { name: "选择模板" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "新建项目" })).toBeNull();
  });
});
