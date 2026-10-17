import type { RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { ConsoleLogs } from "./console-logs.ts";
import type { LibraryClient, PreviewHost, SystemActions } from "./controller-hosts.ts";
import { run } from "./library-fixtures.ts";
import { RunBarActions } from "./run-bar-actions.ts";

// 假客户端只记调用；预览和系统层是记录型的假实现
function setup(runs: RunSnapshot[] = [], shownUrl: string | undefined = undefined) {
  const calls: { method: string; params: unknown }[] = [];
  const client = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      return { entries: [], cursor: "none:0", truncated: false };
    },
    subscribe: async () => ({ sub: 1, unsubscribe: async () => {} }),
    followLogs: async () => ({ unsubscribe: async () => {} }),
  } as unknown as LibraryClient;
  const previewCalls: string[] = [];
  const preview = {
    reload: (id: string) => void previewCalls.push(`reload:${id}`),
    openDevTools: (id: string) => void previewCalls.push(`devtools:${id}`),
    currentUrl: () => shownUrl,
  } as unknown as PreviewHost;
  const opened: string[] = [];
  const system = { openExternal: (url: string) => void opened.push(url) } as SystemActions;
  const consoleLogs = new ConsoleLogs(client);
  const actions = new RunBarActions({
    client,
    preview,
    system,
    console: consoleLogs,
    runs: () => runs,
    act: async (_id, action) => action(),
  });
  return { actions, calls, previewCalls, opened, consoleLogs };
}

const script = (state: RunSnapshot["state"], extra: Partial<RunSnapshot> = {}) =>
  run("s", state, { kind: "oneshot", runId: "run-s", ...extra });

describe("运行条动作", () => {
  it("[DESKTOP-WORKSPACE-27] 重启走 run.restart，只按项目重启，不改持有者和端口", async () => {
    const { actions, calls } = setup();
    await actions.restart("a");
    expect(calls).toEqual([{ method: "run.restart", params: { playground: "a" } }]);
  });

  it("[DESKTOP-WORKSPACE-37] 输入行：运行中的脚本收到这一行加换行", async () => {
    const { actions, calls } = setup([script("running")]);
    await actions.sendInput("s", "Ada");
    expect(calls).toEqual([{ method: "run.stdin", params: { runId: "run-s", data: "Ada\n" } }]);
  });

  it("[DESKTOP-WORKSPACE-38] 脚本没在运行或不是脚本时输入不会发出去", async () => {
    for (const runs of [[script("finished")], [script("errored")], [run("s", "ready")], []]) {
      const { actions, calls } = setup(runs);
      await actions.sendInput("s", "Ada");
      expect(calls).toEqual([]);
    }
  });

  it("[DESKTOP-WORKSPACE-34] 项目自己的开关写进 playground.update", async () => {
    const { actions, calls } = setup();
    await actions.setScriptAutoRun("a", false);
    expect(calls).toEqual([
      { method: "playground.update", params: { playground: "a", scriptAutoRun: false } },
    ]);
  });

  it("[DESKTOP-WORKSPACE-42] 清除：管理进程的日志和界面手里的行都清掉", async () => {
    const { actions, calls, consoleLogs } = setup();
    const appended: unknown[] = [];
    consoleLogs.onAppend((append) => appended.push(append));
    await consoleLogs.watch("a");
    appended.length = 0;
    await actions.clearConsole("a");
    expect(calls.at(-1)).toEqual({ method: "logs.clear", params: { playground: "a" } });
    expect(appended).toEqual([{ playground: "a", lines: [], reset: true }]);
    expect(consoleLogs.lines("a")).toEqual([]);
  });

  it("[DESKTOP-WORKSPACE-31] 刷新只重新加载这个项目的预览", () => {
    const { actions, previewCalls } = setup();
    actions.reloadPreview("a");
    expect(previewCalls).toEqual(["reload:a"]);
  });

  it("[DESKTOP-WORKSPACE-32] 在浏览器中打开：用预览此刻的地址", () => {
    const { actions, opened } = setup([], "http://127.0.0.1:7101/about");
    actions.openPreviewInBrowser("a");
    expect(opened).toEqual(["http://127.0.0.1:7101/about"]);
  });

  it("[DESKTOP-WORKSPACE-32] 预览里的地址不是本机时不交给浏览器，退回运行的地址", () => {
    const { actions, opened } = setup(
      [run("a", "ready", { url: "http://127.0.0.1:7101/" })],
      "https://example.com/",
    );
    actions.openPreviewInBrowser("a");
    expect(opened).toEqual(["http://127.0.0.1:7101/"]);
  });

  it("[DESKTOP-WORKSPACE-32] 没有预览也没有就绪的地址时什么都不打开", () => {
    const { actions, opened } = setup();
    actions.openPreviewInBrowser("a");
    expect(opened).toEqual([]);
  });

  it("[DESKTOP-WORKSPACE-33] 开发者工具开在预览页面上，不是应用界面", () => {
    const { actions, previewCalls } = setup();
    actions.openPreviewDevTools("a");
    expect(previewCalls).toEqual(["devtools:a"]);
  });
});
