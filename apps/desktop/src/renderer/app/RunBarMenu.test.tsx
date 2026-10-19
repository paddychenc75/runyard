// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow } from "../../shared/library-state.ts";
import { RunBar } from "./RunBar.tsx";
import { sampleTab } from "./sample-tab.ts";

afterEach(cleanup);

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

function playground(id: string, name: string): PlaygroundRow {
  return {
    id,
    name,
    path: `/lib/${name}`,
    kind: "server",
    state: "ready",
    active: true,
    previewing: true,
    busy: false,
    note: "计数器",
    templateId: "react19",
    templateName: null,
    port: 7101,
    autoClean: { enabled: false, days: null },
    lastUsedAt: NOW,
    lastOpenedAt: NOW,
    createdBy: { kind: "user" },
    createdAt: 1,
    missing: false,
  };
}

function setup(reply: unknown = { ok: true }, tab = sampleTab()) {
  const call = vi.fn(async () => reply);
  const bridge = {
    bootstrap: { platform: "darwin" },
    call,
    on: () => () => {},
  } as unknown as DesktopBridge;
  const playgrounds = [playground("a", "react-counter"), playground("b", "counter-2")];
  render(
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <RunBar bridge={bridge} tab={tab} playgrounds={playgrounds} />
    </I18nProvider>,
  );
  return call;
}

// 弹窗打开后焦点是异步移进名称框的：等焦点到了再输入
async function waitForNameFocus(dialog: HTMLElement) {
  const name = within(dialog).getByRole("textbox", { name: "名称" });
  await vi.waitFor(() => expect(document.activeElement).toBe(name));
}

describe("工作区的“更多”菜单", () => {
  it("[DESKTOP-WORKSPACE-29] 选“重命名…”：弹窗里是名称、备注和说明（运行中要说明会重新启动），改名保存后交给主进程", async () => {
    const user = userEvent.setup();
    const call = setup();
    await user.click(screen.getByRole("button", { name: "react-counter 的更多操作" }));
    const menu = await screen.findByRole("menu");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual([
      "关闭标签页即停止",
      "重命名…",
      "编辑备注…",
      "自动清理…现在：关闭",
      "另存为模板…",
      "创建副本",
      "在外部编辑器中打开",
      "在访达中显示",
      "在终端中打开",
      "复制路径",
      "复制链接",
      "移到废纸篓",
    ]);
    await user.click(within(menu).getByRole("menuitem", { name: "重命名…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/保存后会停止并用新名称重新启动/)).toBeTruthy();
    expect((within(dialog).getByRole("textbox", { name: /备注/ }) as HTMLInputElement).value).toBe(
      "计数器",
    );
    await waitForNameFocus(dialog);
    await user.keyboard("counter");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(call).toHaveBeenCalledWith("playground.edit", {
      id: "a",
      name: "counter",
      note: "计数器",
    });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("[DESKTOP-WORKSPACE-25] “更多”菜单最上面一行是模板名加“关闭标签页即停止”，不能点", async () => {
    const user = userEvent.setup();
    setup({ ok: true }, sampleTab({ templateName: { en: "Hono", "zh-CN": "Hono" } }));
    await user.click(screen.getByRole("button", { name: "react-counter 的更多操作" }));
    const first = within(await screen.findByRole("menu")).getAllByRole("menuitem")[0];
    expect(first?.textContent).toBe("Hono · 关闭标签页即停止");
    expect(
      first?.getAttribute("aria-disabled") ?? first?.getAttribute("data-disabled"),
    ).not.toBeNull();
  });

  it("[DESKTOP-WORKSPACE-26] 命令行持有的运行：“更多”菜单最上面一行写“通过命令行启动…”的说明", async () => {
    const user = userEvent.setup();
    setup(
      { ok: true },
      sampleTab({ ownedByTab: false, attached: { agent: "Claude Code", startedAt: 1 } }),
    );
    await user.click(screen.getByRole("button", { name: "react-counter 的更多操作" }));
    const first = within(await screen.findByRole("menu")).getAllByRole("menuitem")[0];
    expect(first?.textContent).toContain("命令行启动");
  });

  it("[DESKTOP-WORKSPACE-29] 弹窗里同样校验：重名时写“这个名字已被占用”，保存不可点", async () => {
    const user = userEvent.setup();
    const call = setup();
    await user.click(screen.getByRole("button", { name: "react-counter 的更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "重命名…" }));
    const dialog = await screen.findByRole("dialog");
    await waitForNameFocus(dialog);
    await user.keyboard("counter-2");
    expect(within(dialog).getByText("这个名字已被占用")).toBeTruthy();
    expect(
      (within(dialog).getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.keyboard("{Enter}");
    expect(call).not.toHaveBeenCalledWith("playground.edit", expect.anything());
  });

  it("[DESKTOP-WORKSPACE-29] 弹窗里改名失败：保持打开，写明原因，可以重试", async () => {
    const user = userEvent.setup();
    setup({ ok: false, error: { code: "PATH_LOCKED", params: { name: "react-counter" } } });
    await user.click(screen.getByRole("button", { name: "react-counter 的更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "重命名…" }));
    const dialog = await screen.findByRole("dialog");
    await waitForNameFocus(dialog);
    await user.keyboard("counter");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(await within(dialog).findByText(/文件夹被其他程序占用/)).toBeTruthy();
    expect(
      (within(dialog).getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("[DESKTOP-WORKSPACE-28] 点运行条的“更多”：最上面一行是不可点的说明，其后按设计稿的顺序列出全部项，分成四组，“自动清理…”右侧写“现在：关闭”", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "react-counter 的更多操作" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "关闭标签页即停止",
      "重命名…",
      "编辑备注…",
      "自动清理…现在：关闭",
      "另存为模板…",
      "创建副本",
      "在外部编辑器中打开",
      "在访达中显示",
      "在终端中打开",
      "复制路径",
      "复制链接",
      "移到废纸篓",
    ]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(4);
  });

  it("[DESKTOP-WORKSPACE-30] 选“移到废纸篓”并确认，向主进程发 playground.trash（停止运行、关标签页由主进程做）", async () => {
    const user = userEvent.setup();
    const call = setup();
    await user.click(screen.getByRole("button", { name: "react-counter 的更多操作" }));
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "移到废纸篓" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "把 react-counter 移到废纸篓？",
    });
    expect(within(dialog).getByText(/会先停止运行/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "移到废纸篓" }));
    expect(call).toHaveBeenCalledWith("playground.trash", "a");
  });
});
