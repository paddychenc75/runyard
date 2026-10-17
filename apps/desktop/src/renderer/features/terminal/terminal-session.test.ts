// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCROLLBACK_LINES, type TerminalState } from "../../../shared/terminal.ts";
import { TerminalSession, type TerminalSessionCallbacks } from "./terminal-session.ts";
import { terminalTheme } from "./terminal-theme.ts";
import { fakeBridge, runningSnapshot } from "./test-support/fake-bridge.ts";
import { FakeSearchAddon, FakeTerminal, FakeWebLinksAddon } from "./test-support/fake-xterm.ts";

// @xterm/* 在 vitest.setup.tsx 里统一换成了假类

beforeEach(() => FakeTerminal.reset());
afterEach(() => vi.restoreAllMocks());

function setup(replies: Record<string, unknown> = {}) {
  const fake = fakeBridge({
    "terminal.open": runningSnapshot(),
    "terminal.reopen": runningSnapshot(),
    ...replies,
  });
  const states: TerminalState[] = [];
  const callbacks: TerminalSessionCallbacks = {
    state: (state) => void states.push(state),
    findResults: () => {},
    contextMenu: () => {},
    findRequested: vi.fn(),
    cursorRow: () => {},
  };
  const host = document.createElement("div");
  document.body.append(host);
  const session = new TerminalSession({
    bridge: fake.bridge,
    project: "demo",
    host,
    appearance: "light",
    callbacks,
    noticeText: (state) =>
      state.kind === "running" && state.notice !== undefined
        ? `fallback:${state.notice.shell}`
        : null,
  });
  return { ...fake, session, states, callbacks, term: () => FakeTerminal.last(), host };
}

describe("终端会话：按键", () => {
  it("[DESKTOP-TERMINAL-15] ⌘C 有选中时复制选中的文字；没有选中什么都不做，也不往 shell 写", async () => {
    const t = setup();
    await t.session.start();
    t.term().selection = "hello";
    const withSelection = t.term().press("c", { metaKey: true });
    expect(withSelection).toEqual({ xtermHandles: false, defaultPrevented: true });
    await vi.waitFor(() => expect(t.named("clipboard.copy")).toEqual(["hello"]));
    t.term().selection = "";
    t.term().press("c", { metaKey: true });
    await Promise.resolve();
    expect(t.named("clipboard.copy")).toEqual(["hello"]);
    expect(t.named("terminal.write")).toEqual([]);
  });

  it("[DESKTOP-TERMINAL-15] ⌃C 交给 xterm 照常发给 shell（中断），应用不拦", async () => {
    const t = setup();
    await t.session.start();
    const result = t.term().press("c", { ctrlKey: true });
    expect(result).toEqual({ xtermHandles: true, defaultPrevented: false });
    t.term().emitData("\u0003");
    expect(t.named("terminal.write")).toEqual([{ project: "demo", data: "\u0003" }]);
  });

  it("[DESKTOP-TERMINAL-16] ⌘V 读剪贴板、交给 xterm 的 paste（括号粘贴由它按 shell 的设置包上），不直接写给 shell", async () => {
    const t = setup({ "clipboard.read": "echo a\necho b" });
    await t.session.start();
    t.term().press("v", { metaKey: true });
    await vi.waitFor(() => expect(t.term().pastes).toEqual(["echo a\necho b"]));
    expect(t.named("terminal.write")).toEqual([]);
  });

  it("[DESKTOP-TERMINAL-17] ⌘K 清掉屏幕和回滚内容，并通知主进程清掉记下的输出；shell 什么都没收到", async () => {
    const t = setup();
    await t.session.start();
    t.term().press("k", { metaKey: true });
    await vi.waitFor(() => expect(t.named("terminal.clear")).toEqual([{ project: "demo" }]));
    expect(t.term().cleared).toBe(1);
    expect(t.named("terminal.write")).toEqual([]);
    expect(t.term().disposed).toBe(false);
  });

  it("[DESKTOP-TERMINAL-20] 应用快捷键（⌘P、Esc、⇧⌘P）在终端里：不被终端吞、没有字符送进 shell", async () => {
    const t = setup();
    await t.session.start();
    expect(t.term().press("p", { metaKey: true })).toEqual({
      xtermHandles: false,
      defaultPrevented: false,
    });
    expect(t.term().press("P", { metaKey: true, shiftKey: true })).toEqual({
      xtermHandles: false,
      defaultPrevented: false,
    });
    expect(t.term().press("Escape").xtermHandles).toBe(true);
    expect(t.named("terminal.write")).toEqual([]);
  });

  it("[DESKTOP-TERMINAL-23] ⌘F 请求打开查找栏", async () => {
    const t = setup();
    await t.session.start();
    t.term().press("f", { metaKey: true });
    expect(t.callbacks.findRequested).toHaveBeenCalledTimes(1);
  });
});

describe("终端会话：网址、回滚和配色", () => {
  it("[DESKTOP-TERMINAL-19] 普通点击网址什么都不做；⌘ 加点击才用系统浏览器打开", async () => {
    const t = setup();
    await t.session.start();
    const links = FakeWebLinksAddon.last;
    links?.handler(new MouseEvent("click"), "http://127.0.0.1:5173/");
    expect(t.named("link.openWeb")).toEqual([]);
    links?.handler(new MouseEvent("click", { metaKey: true }), "http://127.0.0.1:5173/");
    expect(t.named("link.openWeb")).toEqual(["http://127.0.0.1:5173/"]);
  });

  it("[DESKTOP-TERMINAL-19] 按住 ⌘ 时才给终端容器打上“按住”的标记（网址的下划线靠它）", async () => {
    const t = setup();
    await t.session.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", metaKey: true }));
    expect(t.host.hasAttribute("data-mod-held")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Meta" }));
    expect(t.host.hasAttribute("data-mod-held")).toBe(false);
  });

  it("[DESKTOP-TERMINAL-21] 回滚缓冲是 10000 行", async () => {
    const t = setup();
    await t.session.start();
    expect(SCROLLBACK_LINES).toBe(10_000);
    expect(t.term().options.scrollback).toBe(10_000);
  });

  it("[DESKTOP-TERMINAL-22] 开始输入就回到底部（滚上去看的时候新输出不拉走视图，是 xterm 的默认行为）", async () => {
    const t = setup();
    await t.session.start();
    expect(t.term().options.scrollOnUserInput).toBe(true);
  });

  it("[DESKTOP-TERMINAL-12] 切主题只换配色：不重建终端、不清内容、不动 shell", async () => {
    const t = setup({ "terminal.open": runningSnapshot("hi\r\n") });
    await t.session.start();
    const before = t.calls.length;
    t.session.setAppearance("dark");
    expect(t.term().options.theme).toEqual(terminalTheme("dark"));
    expect(t.term().resets).toBe(0);
    expect(t.term().disposed).toBe(false);
    expect(t.calls.length).toBe(before);
  });

  it("[DESKTOP-TERMINAL-14] 面板变大：行列变了就告诉主进程新的大小，没变不重复发", async () => {
    const t = setup();
    await t.session.start();
    expect(t.named("terminal.open")).toEqual([{ project: "demo", cols: 100, rows: 30 }]);
    t.term().emitResize(100, 30);
    expect(t.named("terminal.resize")).toEqual([]);
    t.term().emitResize(100, 42);
    expect(t.named("terminal.resize")).toEqual([{ project: "demo", cols: 100, rows: 42 }]);
  });
});

describe("终端会话：输出和回执", () => {
  it("接上时先回放记下的输出，再接新的输出；写完一段才回执那一段的字符数", async () => {
    const t = setup({ "terminal.open": runningSnapshot("old\r\n") });
    await t.session.start();
    expect(t.term().writes).toEqual(["old\r\n"]);
    t.emitData({ project: "demo", data: "new" });
    expect(t.term().writes).toEqual(["old\r\n", "new"]);
    expect(t.named("terminal.ack")).toEqual([{ project: "demo", length: 3 }]);
  });

  it("别的项目的输出不理；快照回来之前推来的输出排在快照后面", async () => {
    let release: (value: unknown) => void = () => {};
    const t = setup({
      "terminal.open": () => new Promise((resolve) => (release = resolve)),
    });
    const started = t.session.start();
    t.emitData({ project: "demo", data: "early" });
    t.emitData({ project: "other", data: "nope" });
    expect(t.term().writes).toEqual([]);
    release(runningSnapshot("snapshot"));
    await started;
    expect(t.term().writes).toEqual(["snapshot", "early"]);
  });

  it("[DESKTOP-TERMINAL-03] 不显示（dispose）只是断开：detach，不结束终端；再显示时用 open 接回同一个", async () => {
    const t = setup();
    await t.session.start();
    t.session.dispose();
    expect(t.named("terminal.detach")).toEqual([{ project: "demo" }]);
    expect(t.term().disposed).toBe(true);
    expect(t.calls.map((c) => c.method)).not.toContain("terminal.reopen");
  });

  it("[DESKTOP-TERMINAL-11] 登录 shell 起不来改用 zsh：说明写在回放的输出前面，作为终端第一行", async () => {
    const t = setup({
      "terminal.open": {
        state: {
          kind: "running",
          pid: 1,
          shell: "/bin/zsh",
          notice: { code: "SHELL_FALLBACK", shell: "/usr/local/bin/fish", reason: "not-found" },
        },
        output: "prompt % ",
      },
    });
    await t.session.start();
    expect(t.term().writes).toEqual(["fallback:/usr/local/bin/fish\r\n", "prompt % "]);
  });
});

describe("终端会话：结束和重新打开", () => {
  const ended: TerminalState = { kind: "ended", reason: "exited", exitCode: 0 };

  it("[DESKTOP-TERMINAL-25] 结束后保留内容，状态交给界面写“已结束”；回车或按钮用 terminal.reopen 开新的并清掉旧内容", async () => {
    const t = setup({ "terminal.open": runningSnapshot("work\r\n") });
    await t.session.start();
    t.emitState({ project: "demo", state: ended });
    expect(t.states.at(-1)).toEqual(ended);
    expect(t.term().resets).toBe(0);
    // 结束后输入不再写给 shell；回车触发重新打开
    t.term().emitData("x");
    expect(t.named("terminal.write")).toEqual([]);
    expect(t.named("terminal.reopen")).toEqual([]);
    t.term().emitData("\r");
    await vi.waitFor(() =>
      expect(t.named("terminal.reopen")).toEqual([{ project: "demo", cols: 100, rows: 30 }]),
    );
    await vi.waitFor(() => expect(t.term().resets).toBe(1));
    expect(t.states.at(-1)?.kind).toBe("running");
  });

  it("[DESKTOP-TERMINAL-26] 后台进程意外结束：状态是 host-crashed，其余界面不受影响（只是这一个会话的状态）", async () => {
    const t = setup();
    await t.session.start();
    t.emitState({ project: "demo", state: { kind: "ended", reason: "host-crashed" } });
    expect(t.states.at(-1)).toEqual({ kind: "ended", reason: "host-crashed" });
  });
});

describe("终端会话：查找", () => {
  it("[DESKTOP-TERMINAL-23] 输入条件按新条件从头找，带高亮；⌘G、⇧⌘G 找下一个、上一个；关闭清掉高亮", async () => {
    const t = setup();
    await t.session.start();
    const search = FakeSearchAddon.last;
    const options = { caseSensitive: false, wholeWord: false, regex: false };
    t.session.setQuery("error", options);
    expect(search?.calls[0]).toMatchObject({ kind: "next", term: "error" });
    expect(search?.calls[0]?.options).toMatchObject({ incremental: true });
    expect(search?.calls[0]?.options?.decorations).toBeTruthy();
    t.term().press("g", { metaKey: true });
    t.term().press("G", { metaKey: true, shiftKey: true });
    expect(search?.calls.slice(1).map((c) => c.kind)).toEqual(["next", "previous"]);
    expect(search?.calls[1]?.options).toMatchObject({ incremental: false });
    t.session.endFind();
    expect(search?.calls.map((c) => c.kind)).toContain("clearDecorations");
    // 关掉之后没有查找条件，⌘G 不再找
    const count = search?.calls.length;
    t.term().press("g", { metaKey: true });
    expect(search?.calls.length).toBe(count);
  });
});
