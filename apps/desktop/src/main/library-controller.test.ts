import { clientError } from "@runyard/client";
import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { type LibraryClient, LibraryController, type PreviewHost } from "./library-controller.ts";
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
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("html")],
      "run.start": run("a", "starting"),
      "run.stop": run("a", "stopped"),
      "playground.create": { playground: playground("c"), created: true },
    };
    return results[method] as MethodResult<M>;
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

function setup() {
  const client = new FakeClient();
  const preview = new FakePreview();
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    locale: "zh-CN",
    preview,
  });
  return { client, preview, controller };
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
      wait: "none",
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

  it("用内置模板新建项目，创建者是用户", async () => {
    const { client, controller } = setup();
    await controller.start();
    await controller.create("html");
    expect(client.calls.find((call) => call.method === "playground.create")?.params).toEqual({
      template: "html",
      createdBy: { kind: "user" },
    });
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
        wait: "none",
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
