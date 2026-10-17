// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
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

// 假接口：console.get 返回“主进程留着的行”，console.appended 由测试推
function fakeBridge(initial: ConsoleLine[] = []) {
  const held = { lines: initial };
  const listeners = new Set<(append: ConsoleAppend) => void>();
  const call = vi.fn(async (method: string) =>
    method === "console.get" ? [...held.lines] : undefined,
  );
  const bridge = {
    bootstrap: { platform: "darwin" },
    call,
    on: (event: string, listener: (append: ConsoleAppend) => void) => {
      if (event === "console.appended") listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as DesktopBridge;
  return {
    bridge,
    call,
    held,
    push: (append: ConsoleAppend) =>
      act(() => {
        for (const listener of listeners) listener(append);
      }),
  };
}

const view = (node: React.ReactNode, locale: "zh-CN" | "en" = "zh-CN") => (
  <I18nProvider locale={locale} platform="darwin" catalogs={desktopCatalogs}>
    {node}
  </I18nProvider>
);

const line = (seq: number, text: string): ConsoleLine => ({
  seq,
  entry: { at: Date.UTC(2026, 9, 17, 12, 0, seq), kind: "stdout", text },
});

const script = (extra: Partial<TabRow>) =>
  sampleTab({ kind: "oneshot", port: null, templateName: null, ...extra });

describe("运行条", () => {
  it("[DESKTOP-WORKSPACE-25] 服务运行中：不写项目名；状态加端口，悬停提示是模板和“关闭标签页即停止”，有“停止”", async () => {
    const { bridge, call } = fakeBridge();
    const tab = sampleTab({ templateName: { en: "Hono", "zh-CN": "Hono" }, port: 7102 });
    render(view(<RunBar bridge={bridge} tab={tab} />));
    const bar = screen.getByRole("group", { name: "运行条" });
    expect(within(bar).queryByText("react-counter")).toBeNull();
    expect(within(bar).queryByText("Hono")).toBeNull();
    expect(within(bar).queryByText("关闭标签页即停止")).toBeNull();
    const user = userEvent.setup();
    await user.hover(within(bar).getByText("运行中 :7102"));
    expect(await screen.findByText("Hono")).toBeTruthy();
    expect(screen.getByText("关闭标签页即停止")).toBeTruthy();
    await user.click(within(bar).getByRole("button", { name: "停止" }));
    expect(call).toHaveBeenCalledWith("run.stop", "a");
  });

  it("命令行持有的运行只是被查看：没有“关闭标签页即停止”的说明，也没有悬停提示", async () => {
    const { bridge } = fakeBridge();
    render(view(<RunBar bridge={bridge} tab={sampleTab({ ownedByTab: false })} />));
    await userEvent.setup().hover(screen.getByText("运行中 :7101"));
    expect(screen.queryByText("关闭标签页即停止")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-12] 已停止显示“运行”，点它启动", async () => {
    const { bridge, call } = fakeBridge();
    const tab = sampleTab({ state: "stopped", active: false, status: "stopped", port: null });
    render(view(<RunBar bridge={bridge} tab={tab} />));
    expect(screen.getByText("已停止")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "运行" }));
    expect(call).toHaveBeenCalledWith("run.start", "a");
  });

  it("脚本出错后显示“重新运行”", () => {
    const { bridge } = fakeBridge();
    const tab = script({
      state: "errored",
      active: false,
      status: "crashed",
      exitCode: 1,
      durationMs: 400,
    });
    render(view(<RunBar bridge={bridge} tab={tab} />));
    expect(screen.getByText("已出错 · 退出码 1 · 0.4 秒")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新运行" })).toBeTruthy();
  });

  it("忙的时候按钮不可点", () => {
    const { bridge } = fakeBridge();
    render(view(<RunBar bridge={bridge} tab={sampleTab({ busy: true })} />));
    expect((screen.getByRole("button", { name: "停止" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("脚本输出", () => {
  it("[DESKTOP-WORKSPACE-15] 脚本跑完：显示输出、“已结束”、退出码和耗时，没有预览", async () => {
    const { bridge } = fakeBridge([line(1, "apple: 3 x 1.5 = 4.50"), line(2, "Total: 12.40")]);
    const tab = script({
      state: "finished",
      active: false,
      status: "stopped",
      exitCode: 0,
      durationMs: 180,
    });
    const { container } = render(view(<ScriptOutput bridge={bridge} tab={tab} />));
    expect(screen.getByText("已结束 · 退出码 0 · 0.18 秒")).toBeTruthy();
    expect(await screen.findByText("Total: 12.40")).toBeTruthy();
    expect(screen.getByText("apple: 3 x 1.5 = 4.50")).toBeTruthy();
    expect(container.querySelector("[data-preview-slot]")).toBeNull();
    expect(screen.getByRole("button", { name: "运行" })).toBeTruthy();
  });

  it("英文界面：Finished · exit code 0 · 0.18 s", () => {
    const { bridge } = fakeBridge();
    const tab = script({
      state: "finished",
      active: false,
      status: "stopped",
      exitCode: 0,
      durationMs: 180,
    });
    render(view(<ScriptOutput bridge={bridge} tab={tab} />, "en"));
    expect(screen.getByText("Finished · exit code 0 · 0.18 s")).toBeTruthy();
  });

  it("脚本运行中：运行中 · 已 N 秒，按钮是停止", () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_200);
    const { bridge } = fakeBridge();
    render(
      view(<ScriptOutput bridge={bridge} tab={script({ state: "running", startedAt: 1_000 })} />),
    );
    expect(screen.getByText("运行中 · 已 3.2 秒")).toBeTruthy();
    expect(screen.getByRole("button", { name: "停止" })).toBeTruthy();
    vi.useRealTimers();
  });
});

describe("控制台", () => {
  it("[DESKTOP-WORKSPACE-16] 新的输出行不需要刷新就出现；进程输出标为用户内容、系统提示按语言翻译", async () => {
    const { bridge, push } = fakeBridge([line(1, "first")]);
    render(view(<ConsolePanel bridge={bridge} tab={sampleTab()} />));
    expect(await screen.findByText("first")).toBeTruthy();
    push({
      playground: "a",
      reset: false,
      lines: [
        line(2, "second"),
        {
          seq: 3,
          entry: { at: 1, kind: "system", notice: { code: "STOPPED_BY_USER", params: {} } },
        },
        { seq: 4, entry: { at: 1, kind: "command", text: "node main.ts" } },
        { seq: 5, entry: { at: 1, kind: "stderr", text: "boom" } },
      ],
    });
    expect(screen.getByText("second").hasAttribute("data-user-content")).toBe(true);
    expect(screen.getByText("你停止了这个项目。")).toBeTruthy();
    expect(screen.getByText("$ node main.ts")).toBeTruthy();
    expect(screen.getByText("boom").closest("[data-tone]")?.getAttribute("data-tone")).toBe(
      "error",
    );
    expect(screen.getByRole("log", { name: "进程输出" })).toBeTruthy();
  });

  it("别的项目的输出不会混进来", async () => {
    const { bridge, push } = fakeBridge();
    render(view(<ConsolePanel bridge={bridge} tab={sampleTab()} />));
    await screen.findByText("还没有输出。");
    push({ playground: "other", reset: false, lines: [line(1, "elsewhere")] });
    expect(screen.queryByText("elsewhere")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-17] 切走（卸载）再回来：之前的输出还在，并继续接新的", async () => {
    const { bridge, held, push } = fakeBridge([line(1, "before")]);
    const first = render(view(<ConsolePanel bridge={bridge} tab={sampleTab()} />));
    expect(await screen.findByText("before")).toBeTruthy();
    push({ playground: "a", reset: false, lines: [line(2, "while-visible")] });
    held.lines = [line(1, "before"), line(2, "while-visible")];
    first.unmount();
    // 离开期间又来了一行，主进程替界面留着
    held.lines = [...held.lines, line(3, "while-away")];
    render(view(<ConsolePanel bridge={bridge} tab={sampleTab()} />));
    expect(await screen.findByText("while-away")).toBeTruthy();
    expect(screen.getByText("before")).toBeTruthy();
    expect(screen.getByText("while-visible")).toBeTruthy();
    push({ playground: "a", reset: false, lines: [line(4, "after")] });
    expect(screen.getByText("after")).toBeTruthy();
  });

  it("整体替换（停止后再次运行）：旧的行被新的换掉", async () => {
    const { bridge, push } = fakeBridge([line(1, "old")]);
    render(view(<ConsolePanel bridge={bridge} tab={sampleTab()} />));
    await screen.findByText("old");
    push({ playground: "a", reset: true, lines: [line(7, "fresh")] });
    expect(screen.queryByText("old")).toBeNull();
    expect(screen.getByText("fresh")).toBeTruthy();
  });
});
