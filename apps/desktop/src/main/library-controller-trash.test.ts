import { clientError } from "@runyard/client";
import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { type LibraryClient, LibraryController, type PreviewHost } from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 更多菜单的移到废纸篓、打开但不运行、终端、从资源库移除（#183、#290）。
// 假客户端把调用记在同一条时间线上，用来断言先后顺序：关标签页 → 放文件监听 → 管理进程移动。
class FakeClient {
  timeline: string[] = [];
  calls: { method: string; params: unknown }[] = [];
  playgrounds = [playground("a", "demo"), playground("b", "react-counter")];
  runs = [run("b", "ready", { url: "http://127.0.0.1:7101/", port: 7101 })];
  trashFails: Error | undefined;
  trashed = true;
  controller: LibraryController | undefined;

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    const id = (params as { playground?: string }).playground;
    if (method === "playground.trash") {
      this.timeline.push(`trash(tabs=${this.controller?.getState().tabs.length})`);
      if (this.trashFails !== undefined) throw this.trashFails;
      if (this.trashed) {
        this.playgrounds = this.playgrounds.filter((row) => row.id !== id);
        this.runs = this.runs.filter((r) => r.playgroundId !== id);
      }
      return { trashed: this.trashed, deletedRegenerable: [] } as MethodResult<M>;
    }
    if (method === "playground.forget") {
      this.playgrounds = this.playgrounds.filter((row) => row.id !== id);
    }
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("html")],
      "settings.get": { libraryRoot: "/home/u/Runyard" },
      "run.start": run(id ?? "a", "starting"),
      "playground.relocate": this.playgrounds[0],
      "playground.forget": {},
    };
    return results[method] as MethodResult<M>;
  };
  followLogs = async () => ({ sub: 2, unsubscribe: async () => {} });
  subscribe: LibraryClient["subscribe"] = async () => ({ sub: 1, unsubscribe: async () => {} });
  count = (method: string) => this.calls.filter((call) => call.method === method).length;
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

async function setup(chosen: string | null = null) {
  const client = new FakeClient();
  const terminals: string[] = [];
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    home: "/lib",
    locale: "zh-CN",
    preview,
    system: {
      revealInFileManager() {},
      copyText() {},
      openExternal() {},
      openTerminal: (path) => void terminals.push(path),
      chooseFolder: async () => chosen,
    },
  });
  client.controller = controller;
  controller.onProjectRelease(async (id) => {
    client.timeline.push(`release(${id},tabs=${controller.getState().tabs.length})`);
  });
  await controller.start();
  return { client, controller, terminals };
}

const ids = (controller: LibraryController) =>
  controller.getState().playgrounds.map((row) => row.id);

describe("移到废纸篓（主进程）", () => {
  it("[DESKTOP-LIBRARY-VIEW-44] 运行中的项目：先关标签页、再放文件监听、最后交给管理进程移动；列表里没有它，标签页已关", async () => {
    const { client, controller } = await setup();
    await controller.openProject("b");
    expect(controller.getState().tabs).toHaveLength(1);
    client.timeline.length = 0;
    const result = await controller.edits.trash("b");
    expect(result).toEqual({ ok: true });
    // 释放监听时标签页已经关了；管理进程移动时监听已经放掉（停止运行在管理进程的 playground.trash 里）
    expect(client.timeline).toEqual(["release(b,tabs=0)", "trash(tabs=0)"]);
    expect(ids(controller)).toEqual(["a"]);
    expect(controller.getState().tabs).toEqual([]);
    expect(controller.getState().activeTab).toBe("library");
  });

  it("[DESKTOP-LIBRARY-VIEW-45] 平台层移到废纸篓失败：原样交回错误，项目仍在列表里，不改成别的删除方式", async () => {
    const { client, controller } = await setup();
    client.trashFails = clientError("TRASH_UNAVAILABLE", { name: "demo" }, "no trash");
    const result = await controller.edits.trash("a");
    expect(result).toMatchObject({ ok: false, error: { code: "TRASH_UNAVAILABLE" } });
    expect(ids(controller).sort()).toEqual(["a", "b"]);
    // 只有一次移动请求，没有任何别的“删除”类调用
    expect(
      client.calls.map((c) => c.method).filter((m) => /trash|remove|delete|forget/.test(m)),
    ).toEqual(["playground.trash"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-45] 管理进程回应没有移走（trashed 为 false）：当作废纸篓不可用，项目留着", async () => {
    const { client, controller } = await setup();
    client.trashed = false;
    const result = await controller.edits.trash("a");
    expect(result).toEqual({
      ok: false,
      error: { code: "TRASH_UNAVAILABLE", params: { name: "demo" } },
    });
    expect(ids(controller).sort()).toEqual(["a", "b"]);
  });
});

describe("打开但不运行、终端、从资源库移除（主进程）", () => {
  it("[DESKTOP-LIBRARY-VIEW-33] 已停止的项目：打开标签页但不启动运行，也不改项目（不算一次使用）", async () => {
    const { client, controller } = await setup();
    client.calls.length = 0;
    await controller.openProjectWithoutRun("a");
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["a"]);
    expect(controller.getState().activeTab).toBe("a");
    expect(client.count("run.start")).toBe(0);
    expect(client.count("playground.update")).toBe(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-33] 已经在运行的项目：与“打开”相同，有标签就切过去、不再启动", async () => {
    const { client, controller } = await setup();
    await controller.openProject("b");
    await controller.selectTab("library");
    client.calls.length = 0;
    await controller.openProjectWithoutRun("b");
    expect(controller.getState().activeTab).toBe("b");
    expect(controller.getState().tabs).toHaveLength(1);
    expect(client.count("run.start")).toBe(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-48] 在终端中打开：把项目文件夹交给系统层（终端本身手动验证）", async () => {
    const { controller, terminals } = await setup();
    controller.system.openTerminal("a");
    controller.system.openTerminal("no-such-project");
    expect(terminals).toEqual(["/lib/demo"]);
  });

  it("[DESKTOP-LIBRARY-VIEW-32] 从资源库移除只发 playground.forget，项目从列表去掉，没有废纸篓调用", async () => {
    const { client, controller } = await setup();
    const result = await controller.edits.forget("a");
    expect(result).toEqual({ ok: true });
    expect(ids(controller)).toEqual(["b"]);
    expect(client.count("playground.trash")).toBe(0);
  });

  it("重新定位：选了文件夹才发 playground.relocate，取消什么都不发", async () => {
    const cancelled = await setup(null);
    expect(await cancelled.controller.edits.relocate("a")).toEqual({ ok: true });
    expect(cancelled.client.count("playground.relocate")).toBe(0);
    const chosen = await setup("/Users/me/Desktop/demo");
    await chosen.controller.edits.relocate("a");
    expect(chosen.client.calls.find((c) => c.method === "playground.relocate")?.params).toEqual({
      playground: "a",
      path: "/Users/me/Desktop/demo",
    });
  });
});
