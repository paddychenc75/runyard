import type { ClientEvent } from "@runyard/client";
import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import type { TerminalHooks } from "./controller-hosts.ts";
import { type LibraryClient, LibraryController, type PreviewHost } from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 终端和标签页、改名、移到废纸篓、管理进程的释放请求怎么接起来（规格 desktop/terminal 的生命周期，#263）。
// 假终端把调用记在和假客户端同一条时间线上，用来断言先后顺序。

class FakeClient {
  timeline: string[] = [];
  calls: { method: string; params: unknown }[] = [];
  playgrounds = [playground("a", "demo"), playground("b", "api")];
  runs: ReturnType<typeof run>[] = [];
  confirmCloseRunningTab = true;
  /** 编辑器写入未保存修改时的回答：false = 用户在询问里选了取消 */
  flushAllowed = true;
  #listeners: ((event: ClientEvent) => void)[] = [];

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    const id = (params as { playground?: string }).playground;
    if (method === "playground.trash") {
      this.timeline.push("playground.trash");
      this.playgrounds = this.playgrounds.filter((row) => row.id !== id);
      return { trashed: true, deletedRegenerable: [] } as MethodResult<M>;
    }
    if (method === "playground.rename") {
      this.timeline.push("playground.rename");
      const newName = (params as { newName: string }).newName;
      this.playgrounds = this.playgrounds.map((row) =>
        row.id === id ? { ...row, name: newName, path: `/lib/${newName}` } : row,
      );
      return {} as MethodResult<M>;
    }
    if (method === "playground.released") this.timeline.push("playground.released");
    if (method === "settings.get") {
      return {
        libraryRoot: "/home/u/Runyard",
        confirmCloseRunningTab: this.confirmCloseRunningTab,
      } as MethodResult<M>;
    }
    if (method === "run.stop") {
      this.runs = this.runs.map((r) =>
        r.playgroundId === id ? { ...r, state: "stopped" as const } : r,
      );
    }
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("html")],
      "run.start": run("a", "starting"),
    };
    return results[method] as MethodResult<M>;
  };

  subscribe: LibraryClient["subscribe"] = async (_topics, listener) => {
    this.#listeners.push(listener);
    return { sub: 1, unsubscribe: async () => {} };
  };

  followLogs = async () => ({ sub: 2, unsubscribe: async () => {} });

  /** 管理进程广播一个事件 */
  emit(event: ClientEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  count = (method: string) => this.calls.filter((call) => call.method === method).length;
}

class FakeTerminals implements TerminalHooks {
  /** 每个项目终端里正在运行的命令；没有是空闲 */
  commands: Record<string, string | null> = {};
  ended: string[] = [];
  readonly #timeline: string[];

  constructor(timeline: string[]) {
    this.#timeline = timeline;
  }

  async end(id: string, reason: string): Promise<void> {
    this.#timeline.push(`terminal.end(${id},${reason})`);
    this.ended.push(`${id}:${reason}`);
  }

  async runningCommand(id: string): Promise<string | null> {
    return this.commands[id] ?? null;
  }
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

async function setup(runs: ReturnType<typeof run>[] = []) {
  const client = new FakeClient();
  client.runs = runs;
  const terminals = new FakeTerminals(client.timeline);
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    home: "/home/u",
    locale: "zh-CN",
    preview,
    terminals,
    system: {
      revealInFileManager() {},
      copyText() {},
      readText: async () => "",
      openExternal() {},
      openTerminal() {},
      chooseFolder: async () => null,
    },
  });
  controller.onProjectRelease({
    flush: async (id, ask) => {
      client.timeline.push(`flush(${id},ask=${ask})`);
      return client.flushAllowed;
    },
    release: async (id, reason) => {
      client.timeline.push(`release-extras(${id},${reason})`);
    },
    restore: async (id) => {
      client.timeline.push(`restore(${id})`);
    },
  });
  await controller.start();
  return { client, controller, terminals };
}

const tabsOf = (controller: LibraryController) => controller.getState().tabs.map((tab) => tab.id);
const readyTabRun = (id: string) => run(id, "ready", { url: "http://127.0.0.1:7101/", port: 7101 });

describe("关闭标签页和终端", () => {
  it("[DESKTOP-TERMINAL-28] 终端空闲、运行已停止：关闭标签页没有确认，直接关，终端随之结束", async () => {
    const { controller, terminals } = await setup();
    await controller.openProjectWithoutRun("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual([]);
    expect(terminals.ended).toEqual(["a:closed"]);
  });

  it("终端里有命令在运行（运行已停止）：先确认，写明命令名，且不会说要停止运行；取消后什么都没结束", async () => {
    const { client, controller, terminals } = await setup();
    terminals.commands.a = "pnpm";
    await controller.openProjectWithoutRun("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toEqual({
      id: "a",
      name: "demo",
      terminalCommand: "pnpm",
      stopsRun: false,
    });
    expect(tabsOf(controller)).toEqual(["a"]);
    controller.cancelClose();
    expect(controller.getState().closeRequest).toBeNull();
    expect(tabsOf(controller)).toEqual(["a"]);
    expect(terminals.ended).toEqual([]);
    expect(client.count("run.stop")).toBe(0);
  });

  it("终端里有命令、运行也在：两句话合在同一个确认里；确认后标签关闭、运行停止、终端结束", async () => {
    const { client, controller, terminals } = await setup([readyTabRun("a")]);
    terminals.commands.a = "pnpm";
    await controller.openProject("a");
    await controller.requestCloseTab("a");
    expect(controller.getState().closeRequest).toMatchObject({
      terminalCommand: "pnpm",
      stopsRun: true,
    });
    await controller.confirmClose("a", false);
    expect(tabsOf(controller)).toEqual([]);
    expect(client.count("run.stop")).toBe(1);
    expect(terminals.ended).toEqual(["a:closed"]);
  });

  it("用户以前勾过“不再提示”：运行那一句不问，但终端里有命令时照样确认", async () => {
    const { client, controller, terminals } = await setup([readyTabRun("a")]);
    client.confirmCloseRunningTab = false;
    await controller.openProject("a");
    // 终端空闲：不问，直接关
    await controller.requestCloseTab("a");
    expect(tabsOf(controller)).toEqual([]);

    // 终端里有命令：还是问
    const second = await setup([readyTabRun("a")]);
    second.client.confirmCloseRunningTab = false;
    second.terminals.commands.a = "pnpm";
    await second.controller.openProject("a");
    await second.controller.requestCloseTab("a");
    expect(second.controller.getState().closeRequest).toMatchObject({
      terminalCommand: "pnpm",
      stopsRun: true,
    });
    expect(terminals.ended).toEqual(["a:closed"]);
  });
});

describe("移到废纸篓、改名和终端", () => {
  it("在应用里移到废纸篓：先关标签页，再结束终端和放文件监听，最后才交给管理进程移动", async () => {
    const { client, controller } = await setup();
    await controller.openProjectWithoutRun("a");
    client.timeline.length = 0;
    expect(await controller.edits.trash("a")).toEqual({ ok: true });
    // 未保存的修改先写入，再关标签页（关了编辑会话就没了），再结束终端和放监听（DESKTOP-EDITOR-77）
    expect(client.timeline).toEqual([
      "flush(a,ask=true)",
      "terminal.end(a,closed)",
      "terminal.end(a,trashed)",
      "release-extras(a,trash)",
      "playground.trash",
    ]);
  });

  it("改名：名称变了先结束终端、放监听，再交给管理进程改名；只改备注不动终端", async () => {
    const { client, controller, terminals } = await setup();
    client.timeline.length = 0;
    expect(await controller.edits.edit({ id: "a", name: "demo2", note: "" })).toEqual({ ok: true });
    expect(client.timeline).toEqual([
      "flush(a,ask=true)",
      "terminal.end(a,renamed)",
      "release-extras(a,rename)",
      "playground.rename",
      "restore(a)",
    ]);
    terminals.ended.length = 0;
    expect(await controller.edits.edit({ id: "a", name: "demo2", note: "新备注" })).toEqual({
      ok: true,
    });
    expect(terminals.ended).toEqual([]);
  });

  it("[DESKTOP-TERMINAL-37] 命令行发起移到废纸篓：管理进程请求释放，应用先结束终端，再回报已释放，管理进程才往下移动；项目没了标签页关闭", async () => {
    const { client, controller, terminals } = await setup();
    await controller.openProjectWithoutRun("a");
    client.timeline.length = 0;
    client.emit({
      event: "playground.releaseRequested",
      data: { playgroundId: "a", reason: "trash" },
      seq: 1,
      gap: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // 没有地方询问用户：直接写入（ask=false），再结束终端、放监听、回报（DESKTOP-EDITOR-78）
    expect(client.timeline).toEqual([
      "flush(a,ask=false)",
      "terminal.end(a,trashed)",
      "release-extras(a,trash)",
      "playground.released",
    ]);
    expect(client.calls.find((c) => c.method === "playground.released")?.params).toEqual({
      playgroundId: "a",
    });
    // 管理进程随后把项目移走：列表重读后项目没了，标签页关闭
    client.playgrounds = client.playgrounds.filter((row) => row.id !== "a");
    await controller.refresh();
    expect(tabsOf(controller)).toEqual([]);
    expect(terminals.ended).toContain("a:trashed");
  });

  it("[DESKTOP-EDITOR-76] 询问时选了取消：改名什么都没动——终端没结束、监听没放、没有调用改名", async () => {
    const { client, controller, terminals } = await setup();
    client.flushAllowed = false;
    client.timeline.length = 0;
    expect(await controller.edits.edit({ id: "a", name: "demo2", note: "" })).toEqual({ ok: true });
    expect(client.timeline).toEqual(["flush(a,ask=true)"]);
    expect(terminals.ended).toEqual([]);
    expect(controller.getState().playgrounds.find((row) => row.id === "a")?.name).toBe("demo");
  });

  it("[DESKTOP-EDITOR-76] 移到废纸篓时选了取消：标签页还开着，没有结束终端，没有调用移到废纸篓", async () => {
    const { client, controller, terminals } = await setup();
    await controller.openProjectWithoutRun("a");
    client.flushAllowed = false;
    client.timeline.length = 0;
    await controller.edits.trash("a");
    expect(client.timeline).toEqual(["flush(a,ask=true)"]);
    expect(tabsOf(controller)).toEqual(["a"]);
    expect(terminals.ended).toEqual([]);
  });

  it("管理进程请求释放改名：写入、放掉之后回报；改名做完（记录里的文件夹变了）并重读之后才把文件监听接回来", async () => {
    const { client, controller } = await setup();
    client.timeline.length = 0;
    client.emit({
      event: "playground.releaseRequested",
      data: { playgroundId: "a", reason: "rename" },
      seq: 1,
      gap: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.timeline).toEqual([
      "flush(a,ask=false)",
      "terminal.end(a,renamed)",
      "release-extras(a,rename)",
      "playground.released",
    ]);
    // 文件夹还没变：不接
    const before = client.playgrounds.find((row) => row.id === "a");
    client.emit({ event: "playground.changed", data: before, seq: 2, gap: false } as ClientEvent);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.timeline).not.toContain("restore(a)");
    // 管理进程改完名：记录里是新文件夹，重读之后接回
    client.playgrounds = client.playgrounds.map((row) =>
      row.id === "a" ? { ...row, name: "demo2", path: "/lib/demo2" } : row,
    );
    client.emit({
      event: "playground.changed",
      data: client.playgrounds.find((row) => row.id === "a"),
      seq: 3,
      gap: false,
    } as ClientEvent);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.timeline.at(-1)).toBe("restore(a)");
    void controller;
  });

  it("管理进程请求释放改名：终端按“改名”结束；终端放不掉也回报，不让管理进程白等", async () => {
    const { client, controller, terminals } = await setup();
    terminals.end = async () => {
      throw new Error("stuck");
    };
    void controller;
    client.emit({
      event: "playground.releaseRequested",
      data: { playgroundId: "b", reason: "rename" },
      seq: 1,
      gap: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.count("playground.released")).toBe(1);
  });
});
