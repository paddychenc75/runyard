import { clientError } from "@runyard/client";
import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { type LibraryClient, LibraryController, type PreviewHost } from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 重命名、备注、自动清理、创建副本（#182）：用有状态的假客户端检查主进程发给管理进程的调用
class FakeClient {
  calls: { method: string; params: unknown }[] = [];
  playgrounds = [playground("a", "demo"), playground("b", "hono-todo-api")];
  runs = [run("b", "ready", { url: "http://127.0.0.1:7102/", port: 7102 })];
  failWith: Error | undefined;

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    if (method === "playground.rename" || method === "playground.update") {
      if (this.failWith !== undefined) throw this.failWith;
    }
    const p = params as Record<string, unknown>;
    if (method === "playground.rename") {
      this.playgrounds = this.playgrounds.map((row) =>
        row.id === p.playground ? { ...row, name: p.newName as string } : row,
      );
    }
    if (method === "playground.update") {
      this.playgrounds = this.playgrounds.map((row) =>
        row.id === p.playground
          ? {
              ...row,
              ...(p.note === undefined ? {} : { note: p.note as string }),
              ...(p.autoClean === undefined
                ? {}
                : {
                    autoClean:
                      p.autoClean === null
                        ? { enabled: false }
                        : { enabled: true, days: p.autoClean as number },
                  }),
            }
          : row,
      );
    }
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("html")],
      "settings.get": { libraryRoot: "/home/u/Runyard" },
      "playground.rename": this.playgrounds[0],
      "playground.update": this.playgrounds[0],
      "playground.duplicate": { ...playground("c", "html-2"), note: "副本" },
    };
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
    home: "/lib",
    locale: "zh-CN",
    preview,
    system: {
      revealInFileManager() {},
      copyText() {},
      openExternal() {},
      readText: async () => "",
      openTerminal() {},
      chooseFolder: async () => null,
    },
  });
  await controller.start();
  return { client, controller };
}

const rowA = (controller: LibraryController) =>
  controller.getState().playgrounds.find((row) => row.id === "a");
const names = (controller: LibraryController) =>
  controller.getState().playgrounds.map((row) => row.name);

describe("重命名与编辑备注（主进程）", () => {
  it("[DESKTOP-LIBRARY-VIEW-34] 改名交给管理进程（它先停止、改名、再用同一个持有者启动），行和标签页标题跟着变", async () => {
    const { client, controller } = await setup();
    await controller.openProject("b");
    client.calls = [];
    const result = await controller.edits.edit({ id: "b", name: "todo-api", note: "" });
    expect(result).toEqual({ ok: true });
    expect(
      client.calls.filter((c) => c.method.startsWith("playground.")).map((c) => c.method),
    ).toEqual(["playground.rename", "playground.list"]);
    expect(client.calls[0]?.params).toEqual({ playground: "b", newName: "todo-api" });
    // 改名不另外发 run.stop / run.start：编排在管理进程里，端口和持有者不变
    expect(client.calls.some((c) => c.method === "run.stop" || c.method === "run.start")).toBe(
      false,
    );
    expect(names(controller)).toContain("todo-api");
    expect(controller.getState().tabs[0]?.name).toBe("todo-api");
  });

  it("[DESKTOP-LIBRARY-VIEW-36] 只改备注：不调用改名，运行不受影响", async () => {
    const { client, controller } = await setup();
    client.calls = [];
    const result = await controller.edits.edit({
      id: "b",
      name: "hono-todo-api",
      note: "试 Suspense",
    });
    expect(result).toEqual({ ok: true });
    expect(client.calls[0]).toEqual({
      method: "playground.update",
      params: { playground: "b", note: "试 Suspense" },
    });
    expect(client.calls.some((c) => c.method === "playground.rename")).toBe(false);
    expect(controller.getState().playgrounds.find((row) => row.id === "b")?.note).toBe(
      "试 Suspense",
    );
  });

  it("[DESKTOP-LIBRARY-VIEW-39] 改名失败：原样交回错误，名称和备注都保持原样", async () => {
    const { client, controller } = await setup();
    client.failWith = clientError("PATH_LOCKED", { name: "demo" }, "locked");
    const result = await controller.edits.edit({ id: "a", name: "demo-2", note: "新备注" });
    expect(result).toMatchObject({ ok: false, error: { code: "PATH_LOCKED" } });
    expect(names(controller).sort()).toEqual(["demo", "hono-todo-api"]);
    expect(client.calls.some((c) => c.method === "playground.update")).toBe(false);
    expect(controller.getState().error).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-40] 切换自动清理：天数或 null 交给管理进程", async () => {
    const { client, controller } = await setup();
    expect(await controller.edits.autoClean("a", 30)).toEqual({ ok: true });
    expect(client.calls.find((c) => c.method === "playground.update")?.params).toEqual({
      playground: "a",
      autoClean: 30,
    });
    expect(rowA(controller)?.autoClean).toEqual({ enabled: true, days: 30 });
    expect(await controller.edits.autoClean("a", null)).toEqual({ ok: true });
    expect(rowA(controller)?.autoClean.enabled).toBe(false);
  });

  it("[DESKTOP-LIBRARY-VIEW-42] 创建副本：交回副本的 id；不启动运行", async () => {
    const { client, controller } = await setup();
    client.calls = [];
    expect(await controller.edits.duplicate("a")).toEqual({ ok: true, id: "c" });
    expect(client.calls[0]).toEqual({
      method: "playground.duplicate",
      params: { playground: "a" },
    });
    expect(client.calls.some((c) => c.method === "run.start")).toBe(false);
  });
});
