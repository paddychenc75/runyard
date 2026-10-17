import { clientError } from "@runyard/client";
import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { type LibraryClient, LibraryController, type PreviewHost } from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 失败画面要的数据：启动请求的错误带着缺工具的参数，崩溃要留住预览的最后一帧
class FakeClient {
  runs: ReturnType<typeof run>[] = [];
  startFailure: Error | undefined;
  startCalls: unknown[] = [];

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    if (method === "run.start") {
      this.startCalls.push(params);
      if (this.startFailure !== undefined) throw this.startFailure;
    }
    const results: Record<string, unknown> = {
      "playground.list": [playground("a")],
      "run.list": this.runs,
      "template.list": [template("html")],
      "settings.get": { libraryRoot: "/home/u/Runyard" },
      "run.start": run("a", "checking"),
      "logs.read": { entries: [], cursor: "r:1", truncated: false },
    };
    return results[method] as MethodResult<M>;
  };
  followLogs = async () => ({ sub: 2, unsubscribe: async () => {} });
  subscribe: LibraryClient["subscribe"] = async () => ({ sub: 1, unsubscribe: async () => {} });
}

class FakePreview implements PreviewHost {
  frame: string | null = "data:image/png;base64,LAST";
  captured = 0;
  show() {}
  hide() {}
  release() {}
  setBounds() {}
  async capture() {
    this.captured += 1;
    return this.frame;
  }
  setVisible() {}
  reload() {}
  currentUrl = () => undefined;
  openDevTools() {}
}

const copied: string[] = [];
const opened: string[] = [];

function setup() {
  const client = new FakeClient();
  const preview = new FakePreview();
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    home: "/home/u",
    locale: "zh-CN",
    preview,
    system: {
      revealInFileManager() {},
      copyText: (text) => void copied.push(text),
      readText: async () => "",
      openExternal: (url) => void opened.push(url),
      openTerminal: () => undefined,
      chooseFolder: async () => null,
    },
  });
  return { client, preview, controller };
}

const tabOf = (controller: LibraryController) => controller.getState().tabs[0];

describe("LibraryController 失败状态的数据", () => {
  it("[DESKTOP-WORKSPACE-18] 缺工具：启动请求的错误参数（含模板自己写的安装命令和链接）交给预览区", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.startFailure = clientError(
      "TOOL_MISSING",
      {
        tool: "go",
        required: ">=1.22 <2",
        installCommand: "brew install go",
        installUrl: "https://go.dev/dl/",
      },
      "go is missing",
    );
    client.runs = [run("a", "failed", { reason: "TOOL_MISSING" })];
    await controller.openProject("a");
    await controller.refresh();
    expect(tabOf(controller)?.failure).toEqual({
      code: "TOOL_MISSING",
      params: {
        tool: "go",
        required: ">=1.22 <2",
        installCommand: "brew install go",
        installUrl: "https://go.dev/dl/",
      },
    });
    // 缺工具是预览区的画面，不是顶部的全局错误
    expect(controller.getState().error).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-18] 再次启动（重新检测）先清掉上一次的失败参数", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.startFailure = clientError("TOOL_MISSING", { tool: "go", required: ">=1.22" }, "x");
    client.runs = [run("a", "failed", { reason: "TOOL_MISSING" })];
    await controller.openProject("a");
    client.startFailure = undefined;
    client.runs = [run("a", "starting", { startedAt: 5 })];
    await controller.startRun("a");
    expect(tabOf(controller)?.failure).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-19] 依赖安装失败：只凭运行状态里的错误码就有失败原因（不需要启动请求的参数）", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.runs = [run("a", "failed", { reason: "SETUP_FAILED" })];
    await controller.openProject("a");
    await controller.refresh();
    expect(tabOf(controller)?.failure).toEqual({ code: "SETUP_FAILED", params: { name: "a" } });
  });

  it("[DESKTOP-WORKSPACE-20] 启动超过 30 秒：状态仍是启动中，只标较慢，没有失败", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.runs = [run("a", "starting", { slow: true })];
    await controller.openProject("a");
    await controller.refresh();
    expect(tabOf(controller)).toMatchObject({ state: "starting", slow: true, failure: null });
  });

  it("[DESKTOP-WORKSPACE-21] 崩溃：预览视图销毁前截下最后一帧，重新运行后清掉", async () => {
    const { client, preview, controller } = setup();
    await controller.start();
    client.runs = [run("a", "ready", { url: "http://127.0.0.1:7101/", port: 7101 })];
    await controller.openProject("a");
    await controller.refresh();
    client.runs = [run("a", "crashed", { exitCode: 1 })];
    await controller.refresh();
    expect(preview.captured).toBe(1);
    expect(tabOf(controller)).toMatchObject({
      state: "crashed",
      exitCode: 1,
      lastFrame: "data:image/png;base64,LAST",
    });
    client.runs = [run("a", "starting", { startedAt: 9 })];
    await controller.startRun("a");
    expect(tabOf(controller)?.lastFrame).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-21] 没有显示过页面就崩溃（启动时就退出）不截帧", async () => {
    const { client, preview, controller } = setup();
    await controller.start();
    client.runs = [run("a", "starting")];
    await controller.openProject("a");
    client.runs = [run("a", "crashed", { exitCode: 1 })];
    await controller.refresh();
    expect(preview.captured).toBe(0);
    expect(tabOf(controller)?.lastFrame).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-22] 端口被占用改用别的端口：说明占用者和现在的端口，状态照常运行", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.runs = [
      run("a", "ready", {
        port: 7112,
        url: "http://127.0.0.1:7112/",
        portFallback: {
          wanted: 7111,
          reason: "PORT_OCCUPIED",
          occupant: { pid: 48213, name: "node" },
        },
      }),
    ];
    await controller.openProject("a");
    await controller.refresh();
    expect(tabOf(controller)).toMatchObject({
      state: "ready",
      failure: null,
      portFallback: {
        wanted: 7111,
        actual: 7112,
        reason: "PORT_OCCUPIED",
        occupant: { pid: 48213, name: "node" },
      },
    });
  });

  it("启动请求等得太久（READY_TIMEOUT）不算失败，也不报全局错误", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.startFailure = clientError("READY_TIMEOUT", { name: "a", seconds: 30 }, "slow");
    client.runs = [run("a", "starting")];
    await controller.openProject("a");
    expect(controller.getState().error).toBeNull();
    expect(tabOf(controller)?.failure).toBeNull();
  });
});

describe("缺工具画面的两个系统动作", () => {
  it("[DESKTOP-WORKSPACE-18] 复制命令只放进剪贴板；官网只放行 https 链接", () => {
    const { controller } = setup();
    controller.system.copyText("brew install go");
    controller.system.openLink("https://go.dev/dl/");
    controller.system.openLink("file:///etc/passwd");
    controller.system.openLink("javascript:alert(1)");
    expect(copied).toEqual(["brew install go"]);
    expect(opened).toEqual(["https://go.dev/dl/"]);
  });

  it("[DESKTOP-TERMINAL-19] 终端输出里的网址只放行 http 和 https（⌘ 加点击），别的协议不理", () => {
    const { controller } = setup();
    controller.system.openWebLink("http://127.0.0.1:5173/");
    controller.system.openWebLink("https://example.com/a?b=1");
    controller.system.openWebLink("file:///etc/passwd");
    controller.system.openWebLink("javascript:alert(1)");
    controller.system.openWebLink("http://a b");
    expect(opened.slice(-2)).toEqual(["http://127.0.0.1:5173/", "https://example.com/a?b=1"]);
    expect(opened).not.toContain("file:///etc/passwd");
  });
});
