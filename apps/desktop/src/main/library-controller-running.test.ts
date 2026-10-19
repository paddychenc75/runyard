import type { MethodName, MethodParams, MethodResult, RunSnapshot } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import type { SavedSession, SessionStore } from "./controller-hosts.ts";
import {
  type LibraryClient,
  LibraryController,
  type PreviewHost,
  type SystemActions,
} from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 运行视图、命令行持有的运行、恢复标签页（规格 DESKTOP-WORKSPACE-43 至 54）的控制器一侧。
// 假管理进程是有状态的：运行表随 run.start、run.stop、run.stopAll、run.adopt 变化

class StatefulClient {
  calls: { method: string; params: unknown }[] = [];
  playgrounds = [playground("a"), playground("b"), playground("c")];
  runs: RunSnapshot[] = [];

  count(method: string): number {
    return this.calls.filter((call) => call.method === method).length;
  }

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    const p = params as Record<string, unknown>;
    let result: unknown;
    switch (method) {
      case "playground.list":
        result = this.playgrounds;
        break;
      case "run.list":
        result = this.runs;
        break;
      case "template.list":
        result = [template("html")];
        break;
      case "settings.get":
        result = { libraryRoot: "/home/u/Runyard", confirmCloseRunningTab: true };
        break;
      case "run.start": {
        const started = run(p.playground as string, "ready", {
          owner: p.owner as RunSnapshot["owner"],
          startedAt: 10,
        });
        this.runs = [...this.runs.filter((r) => r.playgroundId !== started.playgroundId), started];
        result = started;
        break;
      }
      case "run.stop":
        this.runs = this.runs.map((r) =>
          r.playgroundId === p.playground ? { ...r, state: "stopped" } : r,
        );
        result = run("a", "stopped");
        break;
      case "run.stopAll":
        this.runs = this.runs.map((r) => ({ ...r, state: "stopped" }));
        result = { stopped: [] };
        break;
      case "run.adopt":
        this.runs = this.runs.map((r) =>
          r.runId === p.runId ? { ...r, owner: p.owner as RunSnapshot["owner"] } : r,
        );
        result = this.runs[0];
        break;
      default:
        result = {};
    }
    return result as MethodResult<M>;
  };

  followLogs = async () => ({ sub: 2, unsubscribe: async () => {} });
  subscribe: LibraryClient["subscribe"] = async () => ({ sub: 1, unsubscribe: async () => {} });
}

class QuietPreview implements PreviewHost {
  show() {}
  hide() {}
  release() {}
  setBounds() {}
  async capture() {
    return null;
  }
  setVisible() {}
  reload() {}
  currentUrl = () => undefined;
  openDevTools() {}
}

const quietSystem: SystemActions = {
  revealInFileManager() {},
  copyText() {},
  openTerminal() {},
  async chooseFolder() {
    return null;
  },
  openExternal() {},
  readText: async () => "",
};

class MemoryStore implements SessionStore {
  saved: SavedSession | null;
  saves: SavedSession[] = [];
  constructor(initial: SavedSession | null = null) {
    this.saved = initial;
  }
  async load() {
    return this.saved;
  }
  async save(session: SavedSession) {
    this.saved = session;
    this.saves.push(session);
  }
}

const cliRun = (id: string, agent = "Claude Code", extra: Partial<RunSnapshot> = {}) =>
  run(id, "ready", {
    owner: { kind: "cli", agent, command: `runyard run ${id}` },
    startedAt: 5,
    port: 7100,
    ...extra,
  });

function setup(store?: SessionStore) {
  const client = new StatefulClient();
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    locale: "zh-CN",
    preview: new QuietPreview(),
    system: quietSystem,
    home: "/home/u",
    ...(store === undefined ? {} : { session: store }),
  });
  return { client, controller };
}

describe("运行视图的数据", () => {
  it("[DESKTOP-WORKSPACE-43] 两类运行都列出，标签页持有的在前，已结束的脚本不列出", async () => {
    const { client, controller } = setup();
    client.runs = [
      cliRun("a", "Claude Code", { startedAt: 3 }),
      run("b", "ready", { startedAt: 4, port: 7102 }),
      run("c", "finished", { kind: "oneshot", startedAt: 1 }),
    ];
    await controller.start();
    const { runs } = controller.getState();
    expect(runs.map((row) => [row.id, row.source.kind])).toEqual([
      ["b", "tab"],
      ["a", "cli"],
    ]);
    expect(runs[1]?.source).toEqual({ kind: "cli", agent: "Claude Code" });
    expect(runs[0]?.port).toBe(7102);
  });

  it("[DESKTOP-WORKSPACE-44] 停止其中一个：它从列表消失，其余不受影响", async () => {
    const { client, controller } = setup();
    client.runs = [run("a", "ready"), run("b", "ready")];
    await controller.start();
    await controller.stopRun("a");
    expect(client.calls.filter((c) => c.method === "run.stop")).toHaveLength(1);
    expect(controller.getState().runs.map((row) => row.id)).toEqual(["b"]);
  });

  it("[DESKTOP-WORKSPACE-45] 全部停止：列表清空，标签页都还开着、显示已停止", async () => {
    const { client, controller } = setup();
    client.runs = [run("a", "ready"), cliRun("b")];
    await controller.start();
    await controller.openProject("a");
    await controller.stopAll();
    const state = controller.getState();
    expect(state.runs).toEqual([]);
    expect(state.tabs.map((tab) => [tab.id, tab.status])).toEqual([["a", "stopped"]]);
  });
});

describe("命令行持有的运行的查看", () => {
  it("[DESKTOP-WORKSPACE-46] 打开命令行持有、应用里没有标签页的运行：开标签页查看，不启动，持有者仍是命令行", async () => {
    const { client, controller } = setup();
    client.runs = [cliRun("c")];
    await controller.start();
    await controller.openProject("c");
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["c"]);
    expect(client.count("run.start")).toBe(0);
    expect(client.calls.find((c) => c.method === "run.attach")?.params).toEqual({
      runId: "run-c-5",
      clientId: "app-1",
    });
    expect(controller.getState().tabs[0]?.ownedByTab).toBe(false);
  });

  it("[DESKTOP-WORKSPACE-48] 打开 Claude Code 启动的项目：标签页带查看信息（谁、何时启动），运行没有重启", async () => {
    const { client, controller } = setup();
    client.runs = [cliRun("a", "Claude Code", { startedAt: 777 })];
    await controller.start();
    await controller.openProject("a");
    expect(controller.getState().tabs[0]?.attached).toEqual({
      agent: "Claude Code",
      startedAt: 777,
    });
    expect(client.count("run.start")).toBe(0);
  });

  it("[DESKTOP-WORKSPACE-49] 改为由我管理：持有者改成这个标签页（不重启），之后关闭标签页要确认，确认后停止", async () => {
    const { client, controller } = setup();
    client.runs = [cliRun("a")];
    await controller.start();
    await controller.openProject("a");
    await controller.adoptRun("a");
    expect(client.calls.find((c) => c.method === "run.adopt")?.params).toEqual({
      runId: "run-a-5",
      owner: { kind: "tab", clientId: "app-1", tabId: "tab-a" },
    });
    expect(client.count("run.start")).toBe(0);
    const tab = controller.getState().tabs[0];
    expect(tab?.attached).toBeNull();
    expect(tab?.ownedByTab).toBe(true);
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toEqual({ id: "a", name: "a" });
    await controller.confirmClose("a", false);
    expect(client.calls.some((c) => c.method === "run.stop")).toBe(true);
    expect(controller.getState().tabs).toEqual([]);
  });

  it("[DESKTOP-WORKSPACE-50] 从查看画面停止：运行停止，标签页留着显示已停止", async () => {
    const { client, controller } = setup();
    client.runs = [cliRun("a")];
    await controller.start();
    await controller.openProject("a");
    await controller.stopRun("a");
    const tab = controller.getState().tabs[0];
    expect(tab?.status).toBe("stopped");
    expect(tab?.attached).toBeNull();
  });

  it("关掉命令行持有的运行的标签页只是关，不停运行", async () => {
    const { client, controller } = setup();
    client.runs = [cliRun("a")];
    await controller.start();
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    expect(client.count("run.stop")).toBe(0);
    expect(controller.getState().closeRequest).toBeNull();
  });
});

describe("重新打开应用时恢复标签页", () => {
  const last: SavedSession = {
    tabs: [
      { id: "a", running: true },
      { id: "b", running: true },
      { id: "c", running: true },
    ],
    active: "b",
  };

  it("[DESKTOP-WORKSPACE-51] 按原顺序恢复三个标签页，当前是 b 并开始运行，a、c 显示已停止、没有启动", async () => {
    const { client, controller } = setup(new MemoryStore(last));
    await controller.start();
    const state = controller.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual(["a", "b", "c"]);
    expect(state.activeTab).toBe("b");
    expect(
      client.calls
        .filter((c) => c.method === "run.start")
        .map((c) => (c.params as { playground: string }).playground),
    ).toEqual(["b"]);
    expect(state.tabs.map((tab) => [tab.id, tab.status])).toEqual([
      ["a", "stopped"],
      ["b", "running"],
      ["c", "stopped"],
    ]);
  });

  it("[DESKTOP-WORKSPACE-52] 切到 c 才启动，持有者是这个标签页", async () => {
    const { client, controller } = setup(new MemoryStore(last));
    await controller.start();
    await controller.selectTab("c");
    await controller.refresh();
    const started = client.calls.filter((c) => c.method === "run.start");
    expect(started).toHaveLength(2);
    const second = started[1]?.params as unknown as { owner: unknown };
    expect(second.owner).toEqual({
      kind: "tab",
      clientId: "app-1",
      tabId: "tab-c",
    });
    expect(controller.getState().tabs.find((tab) => tab.id === "c")?.ownedByTab).toBe(true);
    // 再切走又切回来，不会再启动一次
    await controller.selectTab("a");
    await controller.selectTab("c");
    await controller.refresh();
    expect(client.count("run.start")).toBe(3);
  });

  it("[DESKTOP-WORKSPACE-53] 已被移到废纸篓的项目不恢复", async () => {
    const { client, controller } = setup(new MemoryStore({ ...last, tabs: last.tabs.slice(0, 2) }));
    client.playgrounds = [playground("a")];
    await controller.start();
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["a"]);
    expect(controller.getState().activeTab).toBe("library");
  });

  it("[DESKTOP-WORKSPACE-54] 恢复时已在命令行运行：标签页是查看画面，没有第二次启动", async () => {
    const { client, controller } = setup(
      new MemoryStore({ tabs: [{ id: "a", running: true }], active: "a" }),
    );
    client.runs = [cliRun("a")];
    await controller.start();
    const tab = controller.getState().tabs[0];
    expect(tab?.attached).not.toBeNull();
    expect(tab?.ownedByTab).toBe(false);
    expect(client.count("run.start")).toBe(0);
  });

  it("上次不在运行的当前标签页恢复后也不启动", async () => {
    const { client, controller } = setup(
      new MemoryStore({ tabs: [{ id: "a", running: false }], active: "a" }),
    );
    await controller.start();
    expect(client.count("run.start")).toBe(0);
    expect(controller.getState().activeTab).toBe("a");
  });

  it("标签页一变就记下（含没启动的恢复标签页仍算在运行），退出开始后不再覆盖", async () => {
    const store = new MemoryStore(last);
    const { controller } = setup(store);
    await controller.start();
    expect(store.saved).toEqual({
      tabs: [
        { id: "a", running: true },
        { id: "b", running: true },
        { id: "c", running: true },
      ],
      active: "b",
    });
    controller.freezeSession();
    await controller.stopAll();
    await controller.requestCloseTab("b");
    expect(store.saved?.tabs.map((tab) => tab.id)).toEqual(["a", "b", "c"]);
  });

  it("记录坏了或没有时当作第一次打开：不恢复任何标签页", async () => {
    const { controller } = setup(new MemoryStore(null));
    await controller.start();
    expect(controller.getState().tabs).toEqual([]);
  });
});

describe("资源库读到之前", () => {
  it("[DESKTOP-CREATE-FLOW-01] 第一次读到之前 loaded 为假，读到之后为真；读失败不算读到", async () => {
    const { client, controller } = setup();
    expect(controller.getState().loaded).toBe(false);
    await controller.start();
    expect(controller.getState().loaded).toBe(true);

    const failing = setup();
    failing.client.call = async () => {
      throw new Error("down");
    };
    await failing.controller.start();
    expect(failing.controller.getState().loaded).toBe(false);
    void client;
  });
});
