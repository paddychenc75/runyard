// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import type { Settings } from "@runyard/protocol";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleAppend, ConsoleLine } from "../../shared/console-state.ts";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { ConsolePanel } from "./ConsolePanel.tsx";
import { RunBar } from "./RunBar.tsx";
import { ScriptOutput } from "./ScriptOutput.tsx";
import { sampleTab } from "./sample-tab.ts";

afterEach(cleanup);

// 假接口：console.get 给“主进程留着的行”，settings.get 给设置，其余记调用
function fakeBridge(lines: ConsoleLine[] = [], globalAutoRun = true) {
  const listeners = new Set<(append: ConsoleAppend) => void>();
  const call = vi.fn(async (method: string) => {
    if (method === "console.get") return [...lines];
    if (method === "settings.get") return { scriptAutoRun: globalAutoRun } as Settings;
    return undefined;
  });
  const bridge = {
    bootstrap: { platform: "darwin" },
    call,
    on: (event: string, listener: (append: ConsoleAppend) => void) => {
      if (event === "console.appended") listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as DesktopBridge;
  const push = (append: ConsoleAppend) =>
    act(() => {
      for (const listener of listeners) listener(append);
    });
  return { bridge, call, push };
}

const view = (node: React.ReactNode, locale: "zh-CN" | "en" = "zh-CN") => (
  <I18nProvider locale={locale} platform="darwin" catalogs={desktopCatalogs}>
    {node}
  </I18nProvider>
);

const line = (seq: number, text: string, kind: "stdout" | "stderr" = "stdout"): ConsoleLine => ({
  seq,
  entry: { at: Date.UTC(2026, 9, 17, 12, 0, seq), kind, text },
});

const script = (extra: Partial<TabRow>) =>
  sampleTab({ kind: "oneshot", port: null, templateName: null, ...extra });
const finished = (extra: Partial<TabRow> = {}) =>
  script({
    state: "finished",
    active: false,
    status: "stopped",
    exitCode: 0,
    durationMs: 180,
    ...extra,
  });

describe("运行条：重启与持有者", () => {
  it("[DESKTOP-WORKSPACE-25] 标签页持有的服务：悬停提示写模板和关闭即停止，按钮是“重启”“停止”和“更多”", async () => {
    const { bridge } = fakeBridge();
    const row = sampleTab({ templateName: { en: "Hono", "zh-CN": "Hono" }, port: 7101 });
    render(view(<RunBar bridge={bridge} tab={row} />));
    const bar = screen.getByRole("group", { name: "运行条" });
    expect(within(bar).getByText("运行中 :7101")).toBeTruthy();
    expect(within(bar).queryByText("关闭标签页即停止")).toBeNull();
    await userEvent.setup().hover(within(bar).getByText("运行中 :7101"));
    expect(await screen.findByText("关闭标签页即停止")).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "重启" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "停止" })).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-26] 命令行持有的运行：悬停提示写明由命令行启动、关闭标签页不会停止", async () => {
    const { bridge } = fakeBridge();
    const row = sampleTab({ ownedByTab: false, attached: { agent: "Claude Code", startedAt: 1 } });
    render(view(<RunBar bridge={bridge} tab={row} />));
    await userEvent.setup().hover(screen.getByText("运行中 :7101"));
    expect(await screen.findByText("由命令行启动，关闭标签页不会停止")).toBeTruthy();
    expect(screen.queryByText("关闭标签页即停止")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-27] 点“重启”只请求重启，不停止；脚本和已停止的没有“重启”", async () => {
    const { bridge, call } = fakeBridge();
    render(view(<RunBar bridge={bridge} tab={sampleTab({ port: 7102 })} />));
    await userEvent.setup().click(screen.getByRole("button", { name: "重启" }));
    expect(call).toHaveBeenCalledWith("run.restart", "a");
    expect(call).not.toHaveBeenCalledWith("run.stop", "a");
    cleanup();
    render(view(<RunBar bridge={bridge} tab={script({ state: "running" })} />));
    expect(screen.queryByRole("button", { name: "重启" })).toBeNull();
    cleanup();
    render(view(<RunBar bridge={bridge} tab={sampleTab({ state: "stopped", active: false })} />));
    expect(screen.queryByRole("button", { name: "重启" })).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-39] 已出错：运行条和输出区都写警示色的“已出错 · 退出码 1 · 0.4 秒”，按钮是“重新运行”", () => {
    const { bridge } = fakeBridge();
    const row = script({
      state: "errored",
      active: false,
      status: "crashed",
      exitCode: 1,
      durationMs: 400,
    });
    render(
      view(
        <>
          <RunBar bridge={bridge} tab={row} />
          <ScriptOutput bridge={bridge} tab={row} />
        </>,
      ),
    );
    const texts = screen.getAllByText("已出错 · 退出码 1 · 0.4 秒");
    expect(texts).toHaveLength(2);
    for (const text of texts) {
      expect(text.closest("[data-danger]")).not.toBeNull();
    }
    expect(screen.getAllByRole("button", { name: "重新运行" })).toHaveLength(2);
  });
});

describe("脚本页：开关、过期标记", () => {
  it("[DESKTOP-WORKSPACE-34] 关掉项目的开关：写进项目的设置；项目的值是关时重新打开仍显示关", async () => {
    const { bridge, call } = fakeBridge();
    render(view(<ScriptOutput bridge={bridge} tab={finished()} />));
    const toggle = screen.getByRole("switch", { name: "保存后自动运行" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await userEvent.setup().click(toggle);
    expect(call).toHaveBeenCalledWith("playground.scriptAutoRun", { id: "a", enabled: false });
    cleanup();
    render(view(<ScriptOutput bridge={bridge} tab={finished({ scriptAutoRun: false })} />));
    expect(
      screen.getByRole("switch", { name: "保存后自动运行" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("[DESKTOP-SETTINGS-09] 全局关掉：标签页上的开关显示为关、不可点，旁边说明是全局设置关的", async () => {
    const { bridge, call } = fakeBridge([], false);
    render(view(<ScriptOutput bridge={bridge} tab={finished({ scriptAutoRun: true })} />));
    const toggle = await screen.findByRole("switch", { name: "保存后自动运行" });
    await screen.findByText("全局设置已关闭");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.hasAttribute("data-disabled") || toggle.hasAttribute("disabled")).toBe(true);
    await userEvent.setup().click(toggle);
    expect(call).not.toHaveBeenCalledWith("playground.scriptAutoRun", expect.anything());
  });

  it("[DESKTOP-WORKSPACE-35] 语法错误：状态旁有“过期”，输出上方有说明，上一次的输出还在", async () => {
    const { bridge } = fakeBridge([line(1, "上一次的结果")]);
    render(view(<ScriptOutput bridge={bridge} tab={finished({ stale: true })} />));
    expect(screen.getByText("过期")).toBeTruthy();
    expect(screen.getByText("代码有语法错误，没有重新运行。下面是上一次的输出。")).toBeTruthy();
    expect(await screen.findByText("上一次的结果")).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-36] 修好后重新运行：“过期”和说明消失", () => {
    const { bridge } = fakeBridge();
    const { rerender } = render(
      view(<ScriptOutput bridge={bridge} tab={finished({ stale: true })} />),
    );
    expect(screen.getByText("过期")).toBeTruthy();
    rerender(
      view(<ScriptOutput bridge={bridge} tab={script({ state: "running", stale: false })} />),
    );
    expect(screen.queryByText("过期")).toBeNull();
    expect(screen.queryByText(/代码有语法错误/)).toBeNull();
  });
});

describe("脚本页：输入行", () => {
  it("[DESKTOP-WORKSPACE-37] 运行中输入 Ada 回车：交给程序，输入行清空", async () => {
    const { bridge, call } = fakeBridge();
    render(view(<ScriptOutput bridge={bridge} tab={script({ state: "running" })} />));
    const input = screen.getByRole("textbox", { name: "给程序的输入" }) as HTMLInputElement;
    expect(input.placeholder).toBe("输入内容后回车发送给程序");
    await userEvent.setup().type(input, "Ada{Enter}");
    expect(call).toHaveBeenCalledWith("run.stdin", { id: "a", line: "Ada" });
    expect(input.value).toBe("");
  });

  it("[DESKTOP-WORKSPACE-38] 脚本已结束：输入行不可输入，写“仅程序运行中可用”", async () => {
    const { bridge, call } = fakeBridge();
    render(view(<ScriptOutput bridge={bridge} tab={finished()} />));
    const input = screen.getByRole("textbox", { name: "给程序的输入" }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText("仅程序运行中可用")).toBeTruthy();
    await userEvent.setup().type(input, "Ada{Enter}");
    expect(call).not.toHaveBeenCalledWith("run.stdin", expect.anything());
  });

  it("服务和页面项目的运行条和控制台没有输入行", () => {
    const { bridge } = fakeBridge();
    render(view(<ConsolePanel bridge={bridge} tab={sampleTab()} />));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("脚本失败", () => {
  it("[DESKTOP-WORKSPACE-40] 出错后：打印的两行和异常的最后几行都在输出区里", async () => {
    const { bridge } = fakeBridge([
      line(1, "已读取 128 行"),
      line(2, "columns: ['id']"),
      line(3, "Traceback (most recent call last):", "stderr"),
      line(4, "KeyError: 'price'", "stderr"),
    ]);
    const row = script({
      state: "errored",
      active: false,
      status: "crashed",
      exitCode: 1,
      durationMs: 400,
    });
    render(view(<ScriptOutput bridge={bridge} tab={row} />));
    for (const text of ["已读取 128 行", "columns: ['id']", "KeyError: 'price'"]) {
      expect(await screen.findByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("还没有输出。")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-41] 启动失败：状态写“启动失败”，输出区写明原因和已有的最后几行，没有“还没有输出”", async () => {
    const { bridge } = fakeBridge([line(1, "env: python3: No such file or directory", "stderr")]);
    const row = script({
      state: "failed",
      active: false,
      status: "crashed",
      durationMs: 0,
      failure: { code: "RUN_FAILED", params: { name: "python-2" } },
    });
    render(view(<ScriptOutput bridge={bridge} tab={row} />));
    expect(screen.getAllByText("启动失败").length).toBeGreaterThan(0);
    expect(screen.getByText("项目 python-2 启动失败")).toBeTruthy();
    expect(screen.getByText("已有的最后几行输出")).toBeTruthy();
    expect(await screen.findByText("env: python3: No such file or directory")).toBeTruthy();
    expect(screen.queryByText("还没有输出。")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-41] 启动失败又没有任何输出：照样写明原因，不写“还没有输出”", async () => {
    const { bridge } = fakeBridge();
    const row = script({
      state: "failed",
      active: false,
      status: "crashed",
      failure: { code: "RUN_FAILED", params: { name: "python-2" } },
    });
    render(view(<ScriptOutput bridge={bridge} tab={row} />));
    expect(screen.getByText("项目 python-2 启动失败")).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByText("还没有输出。")).toBeNull();
  });
});

describe("控制台清除", () => {
  it("[DESKTOP-WORKSPACE-42] 点“清除”请求清除；清除后只剩之后打印的那一行，前面带时间", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => line(i + 1, `old-${i + 1}`));
    const { bridge, call, push } = fakeBridge(lines);
    render(view(<ConsolePanel bridge={bridge} tab={sampleTab()} />));
    await screen.findByText("old-20");
    await userEvent.setup().click(screen.getByRole("button", { name: "清除" }));
    expect(call).toHaveBeenCalledWith("console.clear", "a");
    push({ playground: "a", reset: true, lines: [] });
    push({ playground: "a", reset: false, lines: [line(21, "fresh")] });
    expect(screen.queryByText("old-1")).toBeNull();
    expect(screen.getByText("fresh")).toBeTruthy();
    expect(screen.getByText("fresh").previousElementSibling?.textContent).toMatch(
      /^\d{1,2}:\d{2}:\d{2}$/,
    );
  });
});
