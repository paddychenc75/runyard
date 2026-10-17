import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { type LibraryClient, LibraryController, type PreviewHost } from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 关闭标签页的确认（规格 desktop/workspace DESKTOP-WORKSPACE-04 至 10）。
// 假客户端带一份会被 settings.set 改写的设置，run.stop 会把运行改成已停止，
// 这样“以后不再提示”能跨两次关闭真的生效。
class FakeClient {
  calls: { method: string; params: unknown }[] = [];
  playgrounds = [playground("a"), playground("b")];
  runs: ReturnType<typeof run>[] = [];
  confirmCloseRunningTab = true;
  libraryRoot = "/home/u/Runyard";
  settingsFails = false;

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    if (method === "settings.get") {
      if (this.settingsFails) throw new Error("unavailable");
      return {
        libraryRoot: this.libraryRoot,
        confirmCloseRunningTab: this.confirmCloseRunningTab,
      } as MethodResult<M>;
    }
    if (method === "settings.set") {
      this.confirmCloseRunningTab = (
        params as { confirmCloseRunningTab: boolean }
      ).confirmCloseRunningTab;
      return {} as MethodResult<M>;
    }
    if (method === "run.stop") {
      const id = (params as { playground: string }).playground;
      this.runs = this.runs.map((r) =>
        r.playgroundId === id ? { ...r, state: "stopped" as const } : r,
      );
      return run(id, "stopped") as MethodResult<M>;
    }
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("html")],
      "run.start": run("a", "starting"),
    };
    return results[method] as MethodResult<M>;
  };

  subscribe: LibraryClient["subscribe"] = async () => ({ sub: 1, unsubscribe: async () => {} });

  count(method: string): number {
    return this.calls.filter((call) => call.method === method).length;
  }
}

class FakePreview implements PreviewHost {
  released: string[] = [];
  show() {}
  hide() {}
  release(id: string) {
    this.released.push(id);
  }
  setBounds() {}
  async capture() {
    return null;
  }
  setVisible() {}
}

async function setup(runs: ReturnType<typeof run>[]) {
  const client = new FakeClient();
  client.runs = runs;
  const preview = new FakePreview();
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    home: "/home/u",
    locale: "zh-CN",
    preview,
    system: { revealInFileManager() {}, copyText() {}, openExternal() {} },
  });
  await controller.start();
  return { client, controller, preview };
}

const tabsOf = (controller: LibraryController) => controller.getState().tabs.map((tab) => tab.id);
const readyTabRun = (id: string) => run(id, "ready", { url: "http://127.0.0.1:7101/", port: 7101 });

describe("LibraryController 关闭标签页", () => {
  it("[DESKTOP-WORKSPACE-04] 关闭运行中的标签页先弹确认：标签还在，运行仍是 ready，没有停止", async () => {
    const { client, controller } = await setup([readyTabRun("a")]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    const state = controller.getState();
    expect(state.closeRequest).toEqual({ id: "a", name: "a" });
    expect(tabsOf(controller)).toEqual(["a"]);
    expect(state.tabs[0]?.state).toBe("ready");
    expect(client.count("run.stop")).toBe(0);
  });

  it("[DESKTOP-WORKSPACE-05] 确认后标签关闭，并对这个项目发 run.stop（时限由管理进程保证）", async () => {
    const { client, controller, preview } = await setup([readyTabRun("a")]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    await controller.confirmClose("a", false);
    expect(controller.getState().closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual([]);
    expect(controller.getState().activeTab).toBe("library");
    expect(preview.released).toContain("a");
    expect(client.calls.filter((call) => call.method === "run.stop").map((c) => c.params)).toEqual([
      { playground: "a" },
    ]);
    expect(client.count("settings.set")).toBe(0);
    expect(controller.getState().playgrounds.find((row) => row.id === "a")?.state).toBe("stopped");
  });

  it("[DESKTOP-WORKSPACE-06] 取消什么都不变：弹窗关掉，标签还在，运行仍是 ready", async () => {
    const { client, controller } = await setup([readyTabRun("a")]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    controller.cancelClose();
    const state = controller.getState();
    expect(state.closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual(["a"]);
    expect(state.tabs[0]?.state).toBe("ready");
    expect(client.count("run.stop")).toBe(0);
  });

  it("[DESKTOP-WORKSPACE-07] 勾选“不再提示”并确认：这次照常停止，之后关闭另一个运行中的标签不弹窗直接停", async () => {
    const { client, controller } = await setup([readyTabRun("a"), readyTabRun("b")]);
    await controller.openProject("a");
    await controller.openProject("b");
    await controller.requestCloseTab("a");
    await controller.confirmClose("a", true);
    expect(client.calls.filter((c) => c.method === "settings.set").map((c) => c.params)).toEqual([
      { confirmCloseRunningTab: false },
    ]);
    expect(client.count("run.stop")).toBe(1);

    await controller.requestCloseTab("b");
    expect(controller.getState().closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual([]);
    expect(client.calls.filter((c) => c.method === "run.stop").map((c) => c.params)).toEqual([
      { playground: "a" },
      { playground: "b" },
    ]);
  });

  it("[DESKTOP-SETTINGS-06] 换资源库位置后重读：显示新位置，列表是新位置里的 2 个项目，不对旧位置发任何删除或移动", async () => {
    const { client, controller } = await setup([]);
    client.playgrounds = Array.from({ length: 20 }, (_, i) => playground(`old-${i}`));
    await controller.refresh();
    expect(controller.getState().playgrounds).toHaveLength(20);
    client.libraryRoot = "/home/u/Work/lib";
    client.playgrounds = [playground("new-1"), playground("new-2")];
    await controller.applySettings("zh-CN");
    expect(controller.getState().libraryRoot).toBe("~/Work/lib");
    expect(
      controller
        .getState()
        .playgrounds.map((row) => row.id)
        .sort(),
    ).toEqual(["new-1", "new-2"]);
    expect(client.calls.map((call) => call.method)).not.toContain("playground.trash");
  });

  it("[DESKTOP-SETTINGS-08] 勾过“不再提示”之后，在设置里把“关闭前询问”打开，再关闭运行中的标签页，确认弹窗重新出现", async () => {
    const { client, controller } = await setup([readyTabRun("a"), readyTabRun("b")]);
    await controller.openProject("a");
    await controller.openProject("b");
    await controller.requestCloseTab("a");
    await controller.confirmClose("a", true);
    expect(client.confirmCloseRunningTab).toBe(false);
    // 设置页的开关就是这一次 settings.set
    await client.call("settings.set", { confirmCloseRunningTab: true });
    await controller.requestCloseTab("b");
    expect(controller.getState().closeRequest).toEqual({ id: "b", name: "b" });
    expect(tabsOf(controller)).toEqual(["b"]);
  });

  it("[DESKTOP-WORKSPACE-08] 勾选后取消不记住：不写设置，下次关闭仍然弹出确认", async () => {
    const { client, controller } = await setup([readyTabRun("a")]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    // 界面里勾了框再点取消：取消不带任何勾选信息，主进程什么都不记
    controller.cancelClose();
    expect(client.count("settings.set")).toBe(0);
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toEqual({ id: "a", name: "a" });
  });

  it("[DESKTOP-WORKSPACE-09] 已停止的标签页直接关：不弹确认，也不再发停止", async () => {
    const { client, controller } = await setup([run("a", "stopped")]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual([]);
    expect(client.count("run.stop")).toBe(0);
    // 启动时读过一次资源库文件夹；关闭已停止的标签页不再读设置
    expect(client.count("settings.get")).toBe(1);
  });

  it("[RUN-SCRIPTS-32] 标签页持有的脚本已跑完：关标签页发一次 run.stop，结束保存后自动重跑的监听，不弹确认", async () => {
    const { client, controller } = await setup([run("a", "finished", { kind: "oneshot" })]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual([]);
    expect(client.calls.filter((c) => c.method === "run.stop").map((c) => c.params)).toEqual([
      { playground: "a" },
    ]);
  });

  it("[DESKTOP-WORKSPACE-10] 查看命令行持有的运行：关标签不弹确认，运行继续，持有者仍是命令行", async () => {
    const cliRun = run("a", "ready", {
      owner: { kind: "cli", command: "runyard run a" },
      url: "http://127.0.0.1:7101/",
      port: 7101,
    });
    const { client, controller } = await setup([cliRun]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual([]);
    expect(client.count("run.stop")).toBe(0);
    expect(client.runs[0]?.state).toBe("ready");
    expect(client.runs[0]?.owner.kind).toBe("cli");
  });

  it("读不到设置时按要确认处理，不会悄悄停掉运行", async () => {
    const { client, controller } = await setup([readyTabRun("a")]);
    client.settingsFails = true;
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).not.toBeNull();
    expect(client.count("run.stop")).toBe(0);
  });

  it("记住“不再提示”失败时仍然关闭并停止，错误放进状态", async () => {
    const { client, controller } = await setup([readyTabRun("a")]);
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    const original = client.call;
    client.call = (async (method: MethodName, params: never) => {
      if (method === "settings.set") throw new Error("disk full");
      return original(method, params);
    }) as typeof client.call;
    await controller.confirmClose("a", true);
    expect(tabsOf(controller)).toEqual([]);
    expect(client.count("run.stop")).toBe(1);
    expect(controller.getState().error).not.toBeNull();
  });

  it("对不是等待确认的标签发确认被忽略；等待确认的项目没了，弹窗随之撤掉", async () => {
    const { client, controller } = await setup([readyTabRun("a")]);
    await controller.openProject("a");
    await controller.confirmClose("a", false);
    expect(tabsOf(controller)).toEqual(["a"]);
    await controller.requestCloseTab("a");
    client.playgrounds = [playground("b")];
    await controller.refresh();
    expect(controller.getState().closeRequest).toBeNull();
  });

  it("关闭当前标签时回到左邻的标签", async () => {
    const { controller } = await setup([run("a", "stopped"), run("b", "stopped")]);
    await controller.openProject("a");
    await controller.openProject("b");
    await controller.requestCloseTab("b");
    expect(controller.getState().activeTab).toBe("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().activeTab).toBe("library");
  });
});
