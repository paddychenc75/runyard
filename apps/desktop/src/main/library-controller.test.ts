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
  show(id: string, url: string) {
    this.shown.push({ id, url });
  }
  hide() {
    this.hidden += 1;
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

  it("就绪后预览显示这个项目的地址，停止后收起", async () => {
    const { client, preview, controller } = setup();
    await controller.start();
    await controller.startRun("a");
    expect(preview.shown).toEqual([]);

    client.runs = [run("a", "ready", { url: "http://127.0.0.1:7101", startedAt: 5 })];
    await controller.refresh();
    expect(preview.shown.at(-1)).toEqual({ id: "a", url: "http://127.0.0.1:7101" });

    const hiddenBefore = preview.hidden;
    client.runs = [run("a", "stopped", { startedAt: 5 })];
    await controller.refresh();
    expect(preview.hidden).toBeGreaterThan(hiddenBefore);
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

  it("选中的项目在列表里标为预览中，取消选中收起预览", async () => {
    const { preview, controller } = setup();
    await controller.start();
    await controller.select("b");
    expect(controller.getState().playgrounds.find((row) => row.id === "b")?.previewing).toBe(true);
    const hiddenBefore = preview.hidden;
    await controller.select(null);
    expect(preview.hidden).toBeGreaterThan(hiddenBefore);
  });
});
