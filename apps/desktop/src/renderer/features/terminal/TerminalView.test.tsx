// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalView } from "./TerminalView.tsx";
import { fakeBridge, runningSnapshot } from "./test-support/fake-bridge.ts";
import { FakeSearchAddon, FakeTerminal } from "./test-support/fake-xterm.ts";

// 慢机器上等待条件的期限放宽（用例的时限不变）
const slowWaitFor = (check: () => void | Promise<void>) => vi.waitFor(check, { timeout: 8000 });

beforeEach(() => FakeTerminal.reset());
afterEach(cleanup);

function setup(replies: Record<string, unknown> = {}, locale: "zh-CN" | "en" = "zh-CN") {
  const fake = fakeBridge({
    "terminal.open": runningSnapshot("~ % "),
    "terminal.reopen": runningSnapshot(),
    ...replies,
  });
  render(
    <I18nProvider locale={locale} platform="darwin" catalogs={desktopCatalogs}>
      <TerminalView bridge={fake.bridge} project="demo" appearance="light" focusOnStart={false} />
    </I18nProvider>,
  );
  return fake;
}

const exited = { kind: "ended", reason: "exited", exitCode: 0 } as const;

describe("终端视图：结束后重新打开", () => {
  it("[DESKTOP-TERMINAL-25] 终端结束：保留内容，写“终端已结束（退出码 0）”和“重新打开终端”；点按钮开新的", async () => {
    const user = userEvent.setup();
    const t = setup();
    await slowWaitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    expect(screen.queryByText(/终端已结束/)).toBeNull();
    t.emitState({ project: "demo", state: exited });
    expect(await screen.findByText("终端已结束（退出码 0）")).toBeTruthy();
    expect(FakeTerminal.last().resets).toBe(0);
    await user.click(screen.getByRole("button", { name: "重新打开终端" }));
    await slowWaitFor(() => expect(t.named("terminal.reopen")).toHaveLength(1));
    await slowWaitFor(() => expect(screen.queryByText(/终端已结束/)).toBeNull());
  });

  it("[DESKTOP-TERMINAL-25] 英文界面写 Terminal ended (exit code 0) 和 Reopen terminal", async () => {
    const t = setup({}, "en");
    await slowWaitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    t.emitState({ project: "demo", state: exited });
    expect(await screen.findByText("Terminal ended (exit code 0)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen terminal" })).toBeTruthy();
  });

  it("[DESKTOP-TERMINAL-26] 后台进程意外结束：写“终端意外结束”和重新打开按钮；改名写“项目已改名，终端已关闭”", async () => {
    const t = setup();
    await slowWaitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    t.emitState({ project: "demo", state: { kind: "ended", reason: "host-crashed" } });
    expect(await screen.findByText("终端意外结束")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新打开终端" })).toBeTruthy();
    t.emitState({ project: "demo", state: { kind: "ended", reason: "renamed" } });
    expect(await screen.findByText("项目已改名，终端已关闭")).toBeTruthy();
  });

  it("[DESKTOP-TERMINAL-11] 登录 shell 起不来：第一行写明没能启动哪个 shell、原因和改用的 zsh", async () => {
    setup({
      "terminal.open": {
        state: {
          kind: "running",
          pid: 1,
          shell: "/bin/zsh",
          notice: { code: "SHELL_FALLBACK", shell: "/usr/local/bin/fish", reason: "not-found" },
        },
        output: "% ",
      },
    });
    await slowWaitFor(() => expect(FakeTerminal.last().writes.length).toBe(2));
    const [first, second] = FakeTerminal.last().writes;
    expect(first).toBe("没能启动 /usr/local/bin/fish（文件不存在），已改用 /bin/zsh。\r\n");
    expect(second).toBe("% ");
  });
});

describe("终端视图：查找栏", () => {
  it("[DESKTOP-TERMINAL-23] ⌘F 打开查找栏；输入后显示“第 1 个，共 3 个”；⌘G 依次往下；Esc 关闭、焦点回终端", async () => {
    const user = userEvent.setup();
    const t = setup();
    await slowWaitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    const term = FakeTerminal.last();
    expect(screen.queryByRole("search")).toBeNull();
    term.press("f", { metaKey: true });
    const bar = await screen.findByRole("search", { name: "在终端里查找" });
    await user.type(within(bar).getByRole("textbox", { name: "查找内容" }), "error");
    const search = FakeSearchAddon.last;
    expect(search?.calls.at(-1)).toMatchObject({ kind: "next", term: "error" });
    search?.emitResults(0, 3);
    expect(await within(bar).findByText("第 1 个，共 3 个")).toBeTruthy();
    term.press("g", { metaKey: true });
    search?.emitResults(1, 3);
    expect(await within(bar).findByText("第 2 个，共 3 个")).toBeTruthy();
    const focusBefore = term.focused;
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("search")).toBeNull();
    expect(search?.calls.map((c) => c.kind)).toContain("clearDecorations");
    expect(term.focused).toBeGreaterThan(focusBefore);
  });

  it("[DESKTOP-TERMINAL-23] 查找栏里回车找下一个、⇧回车找上一个；三个开关改变查找条件", async () => {
    const user = userEvent.setup();
    const t = setup();
    await slowWaitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    FakeTerminal.last().press("f", { metaKey: true });
    const bar = await screen.findByRole("search");
    await user.type(within(bar).getByRole("textbox"), "x");
    const search = FakeSearchAddon.last;
    await user.keyboard("{Enter}");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(search?.calls.slice(-2).map((c) => c.kind)).toEqual(["next", "previous"]);
    await user.click(within(bar).getByRole("button", { name: "使用正则表达式" }));
    expect(search?.calls.at(-1)?.options).toMatchObject({ regex: true });
    expect(
      within(bar).getByRole("button", { name: "使用正则表达式" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("终端视图：右键菜单", () => {
  const rightClick = async () => {
    const host = document.querySelector<HTMLElement>("[data-terminal-host]") as HTMLElement;
    host.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }),
    );
  };

  it("[DESKTOP-TERMINAL-18] 右键弹出复制、粘贴、全选、清除；没有选中文字时“复制”不可用", async () => {
    const t = setup();
    await slowWaitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    await rightClick();
    const menu = await screen.findByRole("menu", { name: "终端菜单" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent?.replace(/⌘.$/, ""))).toEqual([
      "复制",
      "粘贴",
      "全选",
      "清除",
    ]);
    expect(items[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(items[1]?.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("[DESKTOP-TERMINAL-18] 有选中文字时“复制”可用，点它复制选中的内容；“清除”清屏", async () => {
    const user = userEvent.setup();
    const t = setup();
    await slowWaitFor(() => expect(t.named("terminal.open")).toHaveLength(1));
    FakeTerminal.last().selection = "src/utils.ts";
    await rightClick();
    await user.click(await screen.findByRole("menuitem", { name: /复制/ }));
    await slowWaitFor(() => expect(t.named("clipboard.copy")).toEqual(["src/utils.ts"]));
    await rightClick();
    await user.click(await screen.findByRole("menuitem", { name: /清除/ }));
    await slowWaitFor(() => expect(t.named("terminal.clear")).toEqual([{ project: "demo" }]));
    expect(FakeTerminal.last().cleared).toBe(1);
  });
});
