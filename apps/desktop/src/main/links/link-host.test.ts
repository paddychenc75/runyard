import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { type LibraryClient, LibraryController, type PreviewHost } from "../library-controller.ts";
import { playground, run, template } from "../library-fixtures.ts";
import { LinkHandler } from "./link-handler.ts";
import { createLinkHost } from "./link-host.ts";

// 链接处理接到真的资源库控制器上：打开已有项目、已开着就切过去、确认后创建并运行（假管理进程）
class FakeClient {
  calls: { method: string; params: unknown }[] = [];
  playgrounds = [playground("d", "demo"), playground("o", "other")];
  runs: ReturnType<typeof run>[] = [];

  count = (method: string) => this.calls.filter((call) => call.method === method).length;

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    const created = playground("n", "landing");
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("html")],
      "settings.get": { libraryRoot: "/home/u/Runyard" },
      "run.start": run("d", "checking"),
      "playground.create": { playground: created, created: true },
      "logs.read": { entries: [], cursor: "r:1", truncated: false },
    };
    if (method === "playground.create") this.playgrounds = [...this.playgrounds, created];
    return results[method] as MethodResult<M>;
  };
  followLogs = async () => ({ sub: 2, unsubscribe: async () => {} });
  subscribe: LibraryClient["subscribe"] = async () => ({ sub: 1, unsubscribe: async () => {} });
}

const preview: PreviewHost = {
  show() {},
  hide() {},
  release() {},
  setBounds() {},
  async capture() {
    return null;
  },
  setVisible() {},
  reload() {},
  currentUrl: () => undefined,
  openDevTools() {},
};

async function setup() {
  const client = new FakeClient();
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    home: "/home/u",
    locale: "zh-CN",
    preview,
    system: {
      revealInFileManager() {},
      copyText() {},
      readText: async () => "",
      openExternal() {},
      openTerminal() {},
      chooseFolder: async () => null,
    },
  });
  await controller.start();
  let focused = 0;
  const handler = new LinkHandler(
    createLinkHost({
      controller,
      focus: () => {
        focused += 1;
      },
      skipConfirmForBuiltin: async () => false,
    }),
  );
  return { client, controller, handler, focused: () => focused };
}

describe("链接接到资源库控制器", () => {
  it("[DESKTOP-LINKS-01] 打开已停止的项目：出现它的标签页，并以这个标签页为持有者开始运行", async () => {
    const { client, controller, handler, focused } = await setup();
    await handler.handle("runyard://open/demo");
    expect(focused()).toBe(1);
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["d"]);
    expect(controller.getState().activeTab).toBe("d");
    expect(client.calls.find((call) => call.method === "run.start")?.params).toMatchObject({
      owner: { kind: "tab", clientId: "app-1" },
    });
  });

  it("[DESKTOP-LINKS-02] 已经开着、当前在别的标签页：切过去，没有第二个标签页，也没有第二次启动", async () => {
    const { client, controller, handler } = await setup();
    await handler.handle("runyard://open/demo");
    await controller.openProject("o");
    expect(controller.getState().activeTab).toBe("o");
    client.runs = [run("d", "ready")];
    await controller.refresh();
    await handler.handle("runyard://open/demo");
    expect(controller.getState().activeTab).toBe("d");
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["d", "o"]);
    expect(client.count("run.start")).toBe(2); // demo 一次、other 一次；链接没有再启动 demo
  });

  it("[DESKTOP-LINKS-03] 没有这个项目：窗口里出现提示，没有新标签页", async () => {
    const { controller, handler } = await setup();
    await handler.handle("runyard://open/nope");
    expect(controller.getState().tabs).toEqual([]);
    expect(controller.getState().notices).toMatchObject([
      { kind: "link", code: "open-missing", value: "nope" },
    ]);
  });

  it("[DESKTOP-LINKS-06] 确认前资源库里没有新项目，待确认请求出现在状态里", async () => {
    const { client, controller, handler } = await setup();
    await handler.handle("runyard://new/html?source=docs.example.dev");
    expect(controller.getState().linkConfirm).toMatchObject({
      source: "docs.example.dev",
      name: "html-1",
      folder: "~/Runyard/html-1",
    });
    expect(client.count("playground.create")).toBe(0);
    expect(controller.getState().playgrounds.map((row) => row.name)).toEqual(["demo", "other"]);
  });

  it("[DESKTOP-LINKS-09] 确认后创建项目（备注、自动清理天数照链接）、打开标签页并运行，持有者是标签页", async () => {
    const { client, controller, handler } = await setup();
    await handler.handle("runyard://new/html?name=landing&note=%E9%A6%96%E9%A1%B5&clean-after=7d");
    await handler.confirm();
    expect(client.calls.find((call) => call.method === "playground.create")?.params).toMatchObject({
      template: "html",
      name: "landing",
      note: "首页",
      autoClean: 7,
      createdBy: { kind: "user" },
    });
    expect(controller.getState().linkConfirm).toBeNull();
    expect(controller.getState().activeTab).toBe("n");
    expect(client.count("run.start")).toBe(1);
  });
});
