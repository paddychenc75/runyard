import { clientError } from "@runyard/client";
import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import {
  type LibraryClient,
  LibraryController,
  type PreviewHost,
  type SystemActions,
} from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 假客户端：记录每次调用，按方法名给固定的返回；subscribe 把监听函数交给测试，以便模拟管理进程的事件
class FakeClient {
  calls: { method: string; params: unknown }[] = [];
  playgrounds = [playground("a"), playground("b")];
  runs: ReturnType<typeof run>[] = [];
  failWith: Error | undefined;
  onEvent: (() => void) | undefined;

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    if (this.failWith !== undefined && (method === "run.start" || method === "run.stop")) {
      throw this.failWith;
    }
    if (method === "playground.create") {
      if (this.failCreate !== undefined) throw this.failCreate;
      // 创建成功后项目出现在列表里（标签页只留列表里有的项目）
      this.playgrounds = [...this.playgrounds, playground("c")];
    }
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("html")],
      "settings.get": { libraryRoot: this.libraryRoot },
      "run.start": run("a", "starting"),
      "run.stop": run("a", "stopped"),
      "logs.read": { entries: this.logEntries, cursor: "r:1", truncated: false },
      "playground.create": { playground: playground("c"), created: true },
    };
    return results[method] as MethodResult<M>;
  };

  failCreate: unknown;
  libraryRoot = "/home/u/Runyard";

  logEntries: { at: number; kind: "stdout"; text: string }[] = [];
  wakeLogs: (() => void) | undefined;

  followLogs = async (_params: unknown, listener: () => void) => {
    this.calls.push({ method: "logs.follow", params: _params });
    this.wakeLogs = listener;
    return { sub: 2, unsubscribe: async () => {} };
  };

  subscribe: LibraryClient["subscribe"] = async (_topics, listener) => {
    this.onEvent = () => listener({ event: "run.exit", data: { runId: "r" }, seq: 1, gap: false });
    return { sub: 1, unsubscribe: async () => {} };
  };
}

class FakePreview implements PreviewHost {
  shown: { id: string; url: string }[] = [];
  hidden = 0;
  released: string[] = [];
  bounds: unknown[] = [];
  visible: boolean[] = [];
  frame: string | null = "data:image/png;base64,AAAA";
  show(id: string, url: string) {
    this.shown.push({ id, url });
  }
  hide() {
    this.hidden += 1;
  }
  release(id: string) {
    this.released.push(id);
  }
  setBounds(bounds: unknown) {
    this.bounds.push(bounds);
  }
  async capture() {
    return this.frame;
  }
  setVisible(visible: boolean) {
    this.visible.push(visible);
  }
}

class FakeSystem implements SystemActions {
  revealed: string[] = [];
  copied: string[] = [];
  revealInFileManager(path: string) {
    this.revealed.push(path);
  }
  terminals: string[] = [];
  openTerminal(path: string) {
    this.terminals.push(path);
  }
  async chooseFolder(): Promise<string | null> {
    return null;
  }
  opened: string[] = [];
  openExternal(url: string) {
    this.opened.push(url);
  }
  copyText(text: string) {
    this.copied.push(text);
  }
}

function setup(options: { libraryRoot?: string } = {}) {
  const client = new FakeClient();
  if (options.libraryRoot !== undefined) client.libraryRoot = options.libraryRoot;
  const preview = new FakePreview();
  const system = new FakeSystem();
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    locale: "zh-CN",
    preview,
    system,
    home: "/home/u",
  });
  return { client, preview, system, controller };
}

describe("LibraryController 实时更新", () => {
  it("[DESKTOP-LIBRARY-VIEW-05] 命令行新建的项目在事件到来后自动出现，创建者不是用户", async () => {
    const { client, controller } = setup();
    await controller.start();
    expect(controller.getState().playgrounds.map((row) => row.name)).toEqual(["a", "b"]);
    client.playgrounds = [
      ...client.playgrounds,
      { ...playground("demo"), createdBy: { kind: "agent", agent: "Claude Code" } },
    ];
    client.onEvent?.();
    await controller.refresh();
    const demo = controller.getState().playgrounds.find((row) => row.name === "demo");
    expect(demo?.createdBy).toEqual({ kind: "agent", agent: "Claude Code" });
  });

  it("[DESKTOP-LIBRARY-VIEW-06] 命令行运行再停止：状态变化，运行中的排到最前，停止后排回去", async () => {
    const { client, controller } = setup();
    client.playgrounds = [
      { ...playground("a"), lastOpenedAt: 100 },
      { ...playground("b"), lastOpenedAt: 50 },
    ];
    await controller.start();
    expect(controller.getState().playgrounds.map((row) => row.id)).toEqual(["a", "b"]);

    client.runs = [run("b", "starting")];
    client.onEvent?.();
    await controller.refresh();
    expect(controller.getState().playgrounds.map((row) => [row.id, row.state])).toEqual([
      ["b", "starting"],
      ["a", "idle"],
    ]);

    client.runs = [run("b", "stopped")];
    client.onEvent?.();
    await controller.refresh();
    expect(controller.getState().playgrounds.map((row) => [row.id, row.state])).toEqual([
      ["a", "idle"],
      ["b", "stopped"],
    ]);
  });
});

describe("LibraryController", () => {
  it("启动时读项目、运行和模板，并订阅 run 与 playground 事件", async () => {
    const { client, controller } = setup();
    await controller.start();
    expect(client.calls.map((call) => call.method).sort()).toEqual([
      "playground.list",
      "run.list",
      "settings.get",
      "template.list",
    ]);
    expect(controller.getState().playgrounds.map((row) => row.id)).toEqual(["a", "b"]);
    expect(controller.getState().templates.map((row) => row.id)).toEqual(["html"]);
    expect(client.onEvent).toBeDefined();
  });

  it("运行用标签页持有者，绑定到本连接的标识，且不等待就绪", async () => {
    const { client, controller } = setup();
    await controller.start();
    await controller.startRun("a");
    const start = client.calls.find((call) => call.method === "run.start");
    expect(start?.params).toEqual({
      playground: "a",
      owner: { kind: "tab", clientId: "app-1", tabId: "tab-a" },
      wait: "ready",
    });
  });

  it("停止按项目发 run.stop", async () => {
    const { client, controller } = setup();
    await controller.start();
    await controller.stopRun("a");
    expect(client.calls.find((call) => call.method === "run.stop")?.params).toEqual({
      playground: "a",
    });
  });

  it("[DESKTOP-WORKSPACE-13] 运行变为 ready 后预览显示该页面；没就绪时没有预览（界面显示占位）", async () => {
    const { client, preview, controller } = setup();
    await controller.start();
    client.runs = [run("a", "starting", { startedAt: 5 })];
    await controller.openProject("a");
    expect(preview.shown).toEqual([]);
    expect(controller.getState().tabs[0]?.previewUrl).toBeNull();

    client.runs = [run("a", "ready", { url: "http://127.0.0.1:7101", startedAt: 5 })];
    await controller.refresh();
    expect(preview.shown.at(-1)).toEqual({ id: "a", url: "http://127.0.0.1:7101" });
    expect(controller.getState().tabs[0]?.previewUrl).toBe("http://127.0.0.1:7101");

    // 停止后页面没了：销毁视图，界面回到占位
    preview.released = [];
    client.runs = [run("a", "stopped", { startedAt: 5 })];
    await controller.refresh();
    expect(preview.released).toContain("a");
    expect(controller.getState().tabs[0]?.previewUrl).toBeNull();
  });

  it("占位区的位置、截帧和显隐都转给预览宿主", async () => {
    const { preview, controller } = setup();
    const area = { x: 10, y: 20, width: 300, height: 200 };
    controller.setPreviewBounds(area);
    controller.setPreviewBounds(null);
    expect(preview.bounds).toEqual([area, null]);
    expect(await controller.capturePreview()).toBe("data:image/png;base64,AAAA");
    controller.setPreviewVisible(false);
    controller.setPreviewVisible(true);
    expect(preview.visible).toEqual([false, true]);
  });

  it("管理进程的事件触发重读", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.runs = [run("b", "running", { startedAt: 3 })];
    client.onEvent?.();
    await controller.refresh();
    expect(controller.getState().playgrounds.find((row) => row.id === "b")?.active).toBe(true);
  });

  it("动作失败时把错误码和参数放进状态，不抛出", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.failWith = clientError("PLAYGROUND_NOT_FOUND", { name: "a" }, "missing");
    await controller.startRun("a");
    expect(controller.getState().error).toEqual({
      code: "PLAYGROUND_NOT_FOUND",
      params: { name: "a" },
    });
  });

  it("不认识的失败按 INTERNAL 显示，下一次动作开始时清掉旧错误", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.failWith = new Error("boom");
    await controller.stopRun("a");
    expect(controller.getState().error?.code).toBe("INTERNAL");
    client.failWith = undefined;
    await controller.stopRun("a");
    expect(controller.getState().error).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-11] 创建并运行：创建者是用户，随后打开项目标签并启动运行，持有者是标签页", async () => {
    const { client, controller } = setup();
    await controller.start();
    const result = await controller.create({
      template: "html",
      name: "demo-1",
      note: "",
      autoClean: null,
    });
    expect(result).toEqual({ ok: true });
    const created = client.calls.find((call) => call.method === "playground.create");
    expect(created?.params).toEqual({
      template: "html",
      name: "demo-1",
      ifExists: "fail",
      createdBy: { kind: "user" },
    });
    // 不传 autoClean 就是“已保留”
    expect(created?.params).not.toHaveProperty("autoClean");
    const start = client.calls.find((call) => call.method === "run.start");
    expect(start?.params).toMatchObject({ playground: "c", owner: { kind: "tab" } });
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["c"]);
    expect(controller.getState().activeTab).toBe("c");
  });

  it("[DESKTOP-CREATE-FLOW-08] 备注和自动清理天数原样交给管理进程", async () => {
    const { client, controller } = setup();
    await controller.start();
    await controller.create({ template: "html", name: "demo-2", note: "pricing", autoClean: 30 });
    expect(client.calls.find((call) => call.method === "playground.create")?.params).toMatchObject({
      note: "pricing",
      autoClean: 30,
    });
  });

  it("[DESKTOP-CREATE-FLOW-09] 创建被拒绝（重名）：把错误交回弹窗，不打开标签页，也不动全局错误", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.failCreate = clientError("NAME_EXISTS", { kind: "playground", name: "demo" }, "exists");
    const result = await controller.create({
      template: "html",
      name: "demo",
      note: "",
      autoClean: null,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "NAME_EXISTS", params: { kind: "playground", name: "demo" } },
    });
    expect(controller.getState().tabs).toEqual([]);
    expect(controller.getState().error).toBeNull();
    expect(client.calls.some((call) => call.method === "run.start")).toBe(false);
  });

  it("资源库文件夹显示成 ~/…（主目录前缀缩写），别处的路径原样", async () => {
    const { controller } = setup();
    await controller.start();
    expect(controller.getState().libraryRoot).toBe("~/Runyard");
    const { controller: other } = setup({ libraryRoot: "/Volumes/data/Runyard" });
    await other.start();
    expect(other.getState().libraryRoot).toBe("/Volumes/data/Runyard");
  });

  it("同一个项目的动作进行中，重复点击被忽略", async () => {
    const { client, controller } = setup();
    await controller.start();
    await Promise.all([controller.startRun("a"), controller.startRun("a")]);
    expect(client.calls.filter((call) => call.method === "run.start")).toHaveLength(1);
  });

  it("[DESKTOP-WORKSPACE-01] 打开项目：新开标签并启动运行，持有者是这个标签，绑定到本连接", async () => {
    const { client, controller } = setup();
    await controller.start();
    await controller.openProject("a");
    const starts = client.calls.filter((call) => call.method === "run.start");
    expect(starts.map((call) => call.params)).toEqual([
      {
        playground: "a",
        owner: { kind: "tab", clientId: "app-1", tabId: "tab-a" },
        wait: "ready",
      },
    ]);
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["a"]);
    expect(controller.getState().activeTab).toBe("a");
  });

  it("[DESKTOP-WORKSPACE-02] 已经打开的项目只切换：标签总数不变，没有第二次启动", async () => {
    const { client, controller } = setup();
    await controller.start();
    await controller.openProject("a");
    await controller.openProject("b");
    expect(controller.getState().activeTab).toBe("b");
    await controller.openProject("a");
    expect(controller.getState().activeTab).toBe("a");
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["a", "b"]);
    const started = client.calls.filter((call) => call.method === "run.start");
    expect(started.map((call) => (call.params as { playground: string }).playground)).toEqual([
      "a",
      "b",
    ]);
  });

  it("[DESKTOP-WORKSPACE-11] 手动停止后标签仍开着，状态是已停止、可再点运行", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.runs = [run("a", "ready", { url: "http://127.0.0.1:7101", startedAt: 5 })];
    await controller.openProject("a");
    expect(controller.getState().tabs[0]).toMatchObject({ status: "running", active: true });
    client.runs = [run("a", "stopped", { startedAt: 5 })];
    await controller.stopRun("a");
    expect(controller.getState().tabs[0]).toMatchObject({
      id: "a",
      status: "stopped",
      active: false,
    });
    expect(controller.getState().activeTab).toBe("a");
  });

  it("[DESKTOP-WORKSPACE-16] 打开标签页：先接上控制台再启动运行，启动阶段的输出也看得到", async () => {
    const { client, controller } = setup();
    await controller.start();
    const pushed: unknown[] = [];
    controller.onConsole((append) => pushed.push(append));
    client.logEntries = [{ at: 1, kind: "stdout", text: "installing" }];
    await controller.openProject("a");
    const order = client.calls.map((call) => call.method);
    expect(order.indexOf("logs.follow")).toBeLessThan(order.indexOf("run.start"));
    expect(controller.consoleLines("a").map((line) => line.entry)).toEqual(client.logEntries);
    expect(pushed).toHaveLength(1);
  });

  it("[DESKTOP-WORKSPACE-17] 切到资源库再切回：控制台里的行还在", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.logEntries = [{ at: 1, kind: "stdout", text: "hello" }];
    await controller.openProject("a");
    controller.selectTab("library");
    controller.selectTab("a");
    expect(controller.consoleLines("a")).toHaveLength(1);
  });

  it("[DESKTOP-WORKSPACE-12] 停止后再运行：重新启动，持有者仍是这个标签", async () => {
    const { client, controller } = setup();
    await controller.start();
    await controller.openProject("a");
    client.runs = [run("a", "stopped", { startedAt: 5 })];
    await controller.stopRun("a");
    await controller.startRun("a");
    const starts = client.calls.filter((call) => call.method === "run.start");
    expect(starts).toHaveLength(2);
    expect(starts[1]?.params).toMatchObject({
      owner: { kind: "tab", clientId: "app-1", tabId: "tab-a" },
    });
    expect(controller.getState().tabs).toHaveLength(1);
  });

  it("预览跟着当前标签：切到资源库收起，切回来再显示", async () => {
    const { client, preview, controller } = setup();
    await controller.start();
    client.runs = [run("a", "ready", { url: "http://127.0.0.1:7101", startedAt: 5 })];
    await controller.openProject("a");
    expect(preview.shown.at(-1)).toEqual({ id: "a", url: "http://127.0.0.1:7101" });
    const hiddenBefore = preview.hidden;
    controller.selectTab("library");
    expect(preview.hidden).toBeGreaterThan(hiddenBefore);
    controller.selectTab("a");
    expect(preview.shown.at(-1)).toEqual({ id: "a", url: "http://127.0.0.1:7101" });
  });

  it("项目从资源库里消失，它的标签随之去掉并回到资源库", async () => {
    const { client, preview, controller } = setup();
    await controller.start();
    await controller.openProject("a");
    client.playgrounds = [client.playgrounds[1] as (typeof client.playgrounds)[number]];
    await controller.refresh();
    expect(controller.getState().tabs).toEqual([]);
    expect(preview.released).toContain("a");
    expect(controller.getState().activeTab).toBe("library");
  });

  it("选不存在的标签被忽略", async () => {
    const { controller } = setup();
    await controller.start();
    controller.selectTab("nope");
    expect(controller.getState().activeTab).toBe("library");
  });
});

describe("资源库行的打开、停止与更多菜单", () => {
  it("[DESKTOP-LIBRARY-VIEW-07] 打开已停止的项目：出现它的标签页并开始运行，持有者是这个标签页", async () => {
    const { client, controller } = setup();
    await controller.start();
    expect(controller.getState().tabs).toEqual([]);
    await controller.openProject("a");
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["a"]);
    const start = client.calls.find((call) => call.method === "run.start");
    expect(start?.params).toMatchObject({
      playground: "a",
      owner: { kind: "tab", clientId: "app-1", tabId: "tab-a" },
    });
  });

  it("[DESKTOP-LIBRARY-VIEW-08] 停止没有标签页的运行：发 run.stop，该行变为已停止、操作回到打开", async () => {
    const { client, controller } = setup();
    client.runs = [
      run("a", "ready", {
        owner: { kind: "cli", clientId: "cli-1", pid: 1, startedAt: 1 } as never,
      }),
    ];
    await controller.start();
    expect(controller.getState().playgrounds[0]?.active).toBe(true);
    client.runs = [run("a", "stopped")];
    await controller.stopRun("a");
    expect(client.calls.some((call) => call.method === "run.stop")).toBe(true);
    const row = controller.getState().playgrounds.find((r) => r.id === "a");
    expect(row?.active).toBe(false);
    expect(row?.state).toBe("stopped");
    expect(controller.getState().tabs).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-11] 复制路径：剪贴板拿到项目文件夹的绝对路径（管理进程给的那份）", async () => {
    const { controller, system } = setup();
    await controller.start();
    controller.system.copyPath("b");
    expect(system.copied).toEqual(["/lib/b"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-12] 在访达中显示：向系统发出选中项目文件夹的请求；不认识的项目什么也不做", async () => {
    const { controller, system } = setup();
    await controller.start();
    controller.system.reveal("a");
    controller.system.reveal("missing");
    controller.system.copyPath("missing");
    expect(system.revealed).toEqual(["/lib/a"]);
    expect(system.copied).toEqual([]);
  });
});

describe("LibraryController 与模板选择器", () => {
  it("[DESKTOP-CREATE-FLOW-02] 为选择器读数据只问项目、运行和模板，不触发任何工具检测", async () => {
    const { client, controller } = setup();
    await controller.start();
    const methods = new Set(client.calls.map((call) => call.method));
    expect([...methods].filter((method) => method.startsWith("tool"))).toEqual([]);
    expect(controller.getState().templates.map((row) => row.id)).toEqual(["html"]);
  });
});
