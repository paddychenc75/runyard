import { clientError } from "@runyard/client";
import type {
  MethodName,
  MethodParams,
  MethodResult,
  Playground,
  RunSnapshot,
} from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import type { SavedSession, SessionStore } from "./controller-hosts.ts";
import {
  type LibraryClient,
  LibraryController,
  type PreviewHost,
  type SystemActions,
} from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 资源库的异常与提示（规格 DESKTOP-LIBRARY-VIEW-49 至 56）和自动清理的提醒（57 至 60）的主进程一侧。
// 假管理进程是有状态的：项目表、运行表、清理清单都能被测试改，调用都记下来。

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 100 * DAY;

class Daemon {
  onRescan?: () => void;
  calls: { method: string; params: unknown }[] = [];
  playgrounds: Playground[] = [];
  runs: RunSnapshot[] = [];
  /** clean.due 的可清理清单 */
  clean: string[] = [];
  /** 重新定位选中的文件夹是别的项目的：管理进程回“项目不存在” */
  relocateMismatch = false;
  createResult: { playground: Playground; created: boolean; notices?: unknown[] } | undefined;

  count = (method: string) => this.calls.filter((call) => call.method === method).length;
  paramsOf = (method: string) =>
    this.calls.filter((call) => call.method === method).map((call) => call.params);

  call = async <M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push({ method, params });
    const p = params as Record<string, unknown>;
    const id = (p.playground ?? p.playgroundId) as string | undefined;
    let result: unknown = {};
    switch (method) {
      case "library.rescan":
        this.onRescan?.();
        break;
      case "playground.list":
        result = this.playgrounds;
        break;
      case "run.list":
        result = this.runs;
        break;
      case "template.list":
        result = [template("react19")];
        break;
      case "settings.get":
        result = { libraryRoot: "/home/u/Library", confirmCloseRunningTab: true };
        break;
      case "playground.relocate": {
        if (this.relocateMismatch)
          throw clientError("PLAYGROUND_NOT_FOUND", { name: id ?? "" }, "no matching id");
        this.playgrounds = this.playgrounds.map((row) => {
          if (row.id !== id) return row;
          const { missingSince: _gone, ...rest } = row;
          return { ...rest, path: p.path as string };
        });
        result = this.playgrounds.find((row) => row.id === id);
        break;
      }
      case "playground.forget":
        this.playgrounds = this.playgrounds.filter((row) => row.id !== id);
        break;
      case "playground.trash":
        this.playgrounds = this.playgrounds.filter((row) => row.id !== id);
        result = { trashed: true, deletedRegenerable: [] };
        break;
      case "clean.due":
        result = { remind: [], clean: this.clean };
        break;
      case "clean.keep":
        this.playgrounds = this.playgrounds.map((row) =>
          row.id === id ? { ...row, autoClean: { enabled: false } } : row,
        );
        break;
      case "playground.create":
        result = this.createResult;
        break;
      default:
    }
    return result as MethodResult<M>;
  };
  followLogs = async () => ({ sub: 2, unsubscribe: async () => {} });
  subscribe: LibraryClient["subscribe"] = async () => ({ sub: 1, unsubscribe: async () => {} });
}

class WatchedPreview implements PreviewHost {
  shown: string[] = [];
  show = (id: string) => void this.shown.push(id);
  hide() {}
  release() {}
  reload() {}
  currentUrl() {
    return undefined;
  }
  openDevTools() {}
  setBounds() {}
  async capture() {
    return null;
  }
  setVisible() {}
}

function setup(
  options: {
    chosen?: string | null;
    session?: SavedSession;
    synced?: boolean;
    directoryExists?: (path: string) => Promise<boolean>;
  } = {},
) {
  const daemon = new Daemon();
  const preview = new WatchedPreview();
  const badges: number[] = [];
  const reveals: string[] = [];
  const system: SystemActions = {
    directoryExists: options.directoryExists,
    revealInFileManager: (path) => void reveals.push(path),
    copyText() {},
    readText: async () => "",
    openExternal() {},
    openTerminal() {},
    chooseFolder: async () => options.chosen ?? null,
  };
  const store: SessionStore | undefined =
    options.session === undefined
      ? undefined
      : { load: async () => options.session ?? null, save: async () => {} };
  const controller = new LibraryController({
    client: daemon as unknown as LibraryClient,
    clientId: "app-1",
    home: "/home/u",
    locale: "zh-CN",
    preview,
    system,
    now: () => NOW,
    dock: { set: (count) => void badges.push(count) },
    isCloudSynced: () => options.synced ?? false,
    ...(store === undefined ? {} : { session: store }),
  });
  return { daemon, controller, preview, badges, reveals };
}

const missing = (id: string, name: string): Playground => ({
  ...playground(id, name),
  path: `/home/u/Runyard/${name}`,
  port: 7106,
  missingSince: 5,
});

const agentMade = (id: string, name: string, extra: Partial<Playground> = {}): Playground => ({
  ...playground(id, name),
  createdAt: NOW - 2000,
  createdBy: {
    kind: "agent",
    agent: "Claude Code",
    command: `runyard new react19 ${name} --run`,
  },
  ...extra,
});

const cliRun = (playgroundId: string): RunSnapshot =>
  run(playgroundId, "ready", {
    owner: { kind: "cli", agent: "Claude Code", command: "runyard new react19 --run" },
    port: 7113,
    startedAt: NOW - 1000,
  });

describe("找不到文件夹（主进程）", () => {
  it("[DESKTOP-LIBRARY-VIEW-49] 管理进程扫描后，该行标成找不到文件夹，说明里要写的原路径缩成 ~", async () => {
    const { daemon, controller } = setup();
    daemon.playgrounds = [missing("v", "vue-drag-list")];
    await controller.start();
    expect(daemon.count("library.rescan")).toBe(1);
    const [row] = controller.getState().playgrounds;
    expect(row?.missing).toBe(true);
    expect(row?.folder).toBe("~/Runyard/vue-drag-list");
  });

  it("[DESKTOP-LIBRARY-VIEW-50] 重新定位选中的文件夹：该行恢复，端口仍是原来的", async () => {
    const { daemon, controller } = setup({ chosen: "/home/u/Desktop/vue-drag-list" });
    daemon.playgrounds = [missing("v", "vue-drag-list")];
    await controller.start();
    expect(await controller.edits.relocate("v")).toEqual({ ok: true });
    expect(daemon.paramsOf("playground.relocate")).toEqual([
      { playground: "v", path: "/home/u/Desktop/vue-drag-list" },
    ]);
    const [row] = controller.getState().playgrounds;
    expect(row?.missing).toBe(false);
    expect(row?.port).toBe(7106);
  });

  it("[DESKTOP-LIBRARY-VIEW-51] 选了别的项目的文件夹：错误原样交回，什么都没改，该行仍是找不到文件夹", async () => {
    const { daemon, controller } = setup({ chosen: "/home/u/Desktop/other" });
    daemon.playgrounds = [missing("v", "vue-drag-list")];
    daemon.relocateMismatch = true;
    await controller.start();
    expect(await controller.edits.relocate("v")).toMatchObject({
      ok: false,
      error: { code: "PLAYGROUND_NOT_FOUND" },
    });
    expect(controller.getState().playgrounds[0]?.missing).toBe(true);
    expect(controller.getState().playgrounds[0]?.path).toBe("/home/u/Runyard/vue-drag-list");
  });

  it("[DESKTOP-LIBRARY-VIEW-52] 从资源库移除：该行消失，只发了 forget，没有任何移动或删除磁盘文件的调用", async () => {
    const { daemon, controller } = setup();
    daemon.playgrounds = [missing("v", "vue-drag-list"), playground("a")];
    await controller.start();
    expect(await controller.edits.forget("v")).toEqual({ ok: true });
    expect(controller.getState().playgrounds.map((row) => row.id)).toEqual(["a"]);
    expect(daemon.count("playground.forget")).toBe(1);
    expect(daemon.count("playground.trash")).toBe(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-49] 对找不到文件夹的项目“打开”：留在资源库定位说明，不开新标签或启动", async () => {
    const { daemon, controller } = setup();
    daemon.playgrounds = [missing("v", "vue-drag-list")];
    await controller.start();
    await controller.openProject("v");
    await controller.startRun("v");
    expect(daemon.count("run.start")).toBe(0);
    expect(controller.getState().tabs).toEqual([]);
    expect(controller.getState().activeTab).toBe("library");
    expect(controller.getState().libraryReveal?.id).toBe("v");
    await controller.openProjectWithoutRun("v");
    expect(controller.getState().tabs).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-49] 恢复上次的标签页时，文件夹找不到的不启动，显示同一条说明", async () => {
    const { daemon, controller } = setup({
      session: { tabs: [{ id: "v", running: true }], active: "v" },
    });
    daemon.playgrounds = [missing("v", "vue-drag-list")];
    await controller.start();
    expect(daemon.count("run.start")).toBe(0);
    expect(controller.getState().activeTab).toBe("v");
    expect(controller.getState().tabs[0]?.missing).toBe(true);
  });

  it("[DESKTOP-LIBRARY-VIEW-49] “在访达中显示上一级文件夹”显示原路径的上一级", async () => {
    const { daemon, controller, reveals } = setup();
    daemon.playgrounds = [missing("v", "vue-drag-list")];
    await controller.start();
    controller.system.revealParent("v");
    expect(reveals).toEqual(["/home/u/Runyard"]);
  });
});

describe("智能体创建并运行的提示（主进程）", () => {
  it("[DESKTOP-LIBRARY-VIEW-54] 智能体创建并运行：右下角出现提示；标签页、焦点不变，预览没有被动", async () => {
    const { daemon, controller, preview } = setup();
    daemon.playgrounds = [playground("c", "react-counter")];
    await controller.start();
    await controller.openProject("c");
    const before = controller.getState();
    daemon.playgrounds = [...daemon.playgrounds, agentMade("n", "react19-5")];
    daemon.runs = [...daemon.runs, cliRun("n")];
    await controller.refresh();
    const state = controller.getState();
    expect(state.notices).toEqual([
      {
        kind: "agent-run",
        id: expect.any(String),
        playgroundId: "n",
        name: "react19-5",
        agent: "Claude Code",
        url: "http://127.0.0.1:7113/",
        at: NOW,
      },
    ]);
    expect(state.activeTab).toBe(before.activeTab);
    expect(state.tabs.map((tab) => tab.id)).toEqual(["c"]);
    expect(preview.shown).not.toContain("n");
  });

  it("[DESKTOP-LIBRARY-VIEW-101] 智能体标识带版本后缀（claude-code_2-1-2）：提示和持有者都写 Claude Code", async () => {
    const { daemon, controller } = setup();
    await controller.start();
    const raw = "claude-code_2-1-2";
    daemon.playgrounds = [
      agentMade("n", "react19-5", {
        createdBy: { kind: "agent", agent: raw, command: "runyard new" },
      }),
    ];
    daemon.runs = [
      run("n", "ready", {
        owner: { kind: "cli", agent: raw, command: "runyard new" },
        port: 7113,
        startedAt: NOW - 1000,
      }),
    ];
    await controller.refresh();
    const state = controller.getState();
    expect(state.notices).toMatchObject([{ kind: "agent-run", agent: "Claude Code" }]);
    await controller.openProject("n");
    expect(controller.getState().tabs[0]?.attached).toMatchObject({ agent: "Claude Code" });
  });

  it("[DESKTOP-LIBRARY-VIEW-102] 命令行用户（没有智能体名字）自己创建并运行：没有提示", async () => {
    const { daemon, controller } = setup();
    await controller.start();
    daemon.playgrounds = [
      agentMade("c", "landing-hero", {
        createdBy: { kind: "cli", command: "runyard new react19 --run" },
      }),
    ];
    daemon.runs = [
      run("c", "ready", {
        owner: { kind: "cli", command: "runyard new react19 --run" },
        port: 7113,
        startedAt: NOW - 1000,
      }),
    ];
    await controller.refresh();
    expect(controller.getState().notices).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-55] 点“打开”：出现它的标签页，持有者仍是命令行，不另行启动；关掉提示后它消失", async () => {
    const { daemon, controller } = setup();
    await controller.start();
    daemon.playgrounds = [agentMade("n", "react19-5")];
    daemon.runs = [cliRun("n")];
    await controller.refresh();
    const [notice] = controller.getState().notices ?? [];
    await controller.openProject("n");
    controller.chrome.dismissNotice(notice?.id ?? "");
    const state = controller.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual(["n"]);
    expect(state.tabs[0]?.attached).toMatchObject({ agent: "Claude Code" });
    expect(daemon.count("run.start")).toBe(0);
    expect(state.notices).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-56] 只创建不运行：列表里有新行，没有提示", async () => {
    const { daemon, controller } = setup();
    await controller.start();
    daemon.playgrounds = [agentMade("h", "html-1")];
    await controller.refresh();
    expect(controller.getState().playgrounds).toHaveLength(1);
    expect(controller.getState().notices).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-54] 应用打开之前就在跑的、用户自己创建的、事后才由命令行启动的，都不提示", async () => {
    const { daemon, controller } = setup();
    daemon.playgrounds = [
      agentMade("old", "old-1"),
      { ...playground("mine", "mine-1"), createdAt: NOW - 2000 },
    ];
    daemon.runs = [cliRun("old")];
    await controller.start();
    expect(controller.getState().notices).toEqual([]);
    daemon.runs = [...daemon.runs, { ...cliRun("mine"), runId: "r-mine" }];
    await controller.refresh();
    expect(controller.getState().notices).toEqual([]);
    // 创建很久之后才由命令行启动：不是“创建并运行”
    daemon.playgrounds = [
      ...daemon.playgrounds,
      agentMade("late", "late-1", { createdAt: NOW - 10 * 60_000 }),
    ];
    daemon.runs = [...daemon.runs, { ...cliRun("late"), runId: "r-late" }];
    await controller.refresh();
    expect(controller.getState().notices).toEqual([]);
  });

  it("[DESKTOP-LIBRARY-VIEW-54] 运行结束后提示里的“停止”没有对象了，提示随之撤掉", async () => {
    const { daemon, controller } = setup();
    await controller.start();
    daemon.playgrounds = [agentMade("n", "react19-5")];
    daemon.runs = [cliRun("n")];
    await controller.refresh();
    expect(controller.getState().notices).toHaveLength(1);
    daemon.runs = daemon.runs.map((r) => ({ ...r, state: "stopped" }));
    await controller.refresh();
    expect(controller.getState().notices).toEqual([]);
  });
});

describe("创建时的提示（主进程）", () => {
  it("[DESKTOP-CREATE-FLOW-21] 创建成功带回路径接近上限的提示：给一条提示，创建照常；关掉后消失", async () => {
    const { daemon, controller } = setup();
    await controller.start();
    const created = { ...playground("n", "long-name"), createdBy: { kind: "user" as const } };
    daemon.createResult = {
      playground: created,
      created: true,
      notices: [{ code: "PATH_NEAR_LIMIT", params: { length: 240, limit: 255 } }],
    };
    daemon.playgrounds = [created];
    expect(
      await controller.create({
        template: "react19",
        name: "long-name",
        note: "",
        autoClean: null,
      }),
    ).toEqual({ ok: true });
    const [notice] = controller.getState().notices ?? [];
    expect(notice).toMatchObject({
      kind: "path-near-limit",
      name: "long-name",
      length: 240,
      limit: 255,
    });
    controller.chrome.dismissNotice(notice?.id ?? "");
    expect(controller.getState().notices).toEqual([]);
  });

  it("[DESKTOP-CREATE-FLOW-20] 资源库在同步目录下：状态里带标记，新建弹窗据此给警告；不在就没有", async () => {
    const yes = setup({ synced: true });
    await yes.controller.start();
    expect(yes.controller.getState().libraryRootSynced).toBe(true);
    const no = setup();
    await no.controller.start();
    expect(no.controller.getState().libraryRootSynced).toBe(false);
  });
});

describe("自动清理的提醒（主进程）", () => {
  const nodeTs = (extra: Partial<Playground> = {}): Playground => ({
    ...playground("n", "node-ts-1"),
    autoClean: { enabled: true, days: 30 },
    lastUsedAt: NOW - 29 * DAY - HOUR,
    ...extra,
  });

  it("[DESKTOP-LIBRARY-VIEW-57] 离到期不足一天：提示条列出名称和已几天没打开，Dock 角标是 1；不是它的项目不进来", async () => {
    const { daemon, controller, badges } = setup();
    daemon.playgrounds = [
      nodeTs(),
      {
        ...playground("fresh", "fresh-1"),
        autoClean: { enabled: true, days: 30 },
        lastUsedAt: NOW - 5 * DAY,
      },
      { ...playground("kept", "kept-1"), lastUsedAt: NOW - 90 * DAY },
      nodeTs({ id: "gone", name: "gone-1", missingSince: 1 }),
    ];
    await controller.start();
    const state = controller.getState();
    expect(state.cleanReminder).toEqual([{ id: "n", name: "node-ts-1", idleDays: 29 }]);
    expect(state.cleanDueCount).toBe(1);
    expect(badges.at(-1)).toBe(1);
  });

  it("[DESKTOP-LIBRARY-VIEW-58] 窗口关着：角标是 1，但没有回报“提醒已显示”；提示条真显示出来后才回报，且只回报一次", async () => {
    const { daemon, controller, badges } = setup();
    daemon.playgrounds = [nodeTs()];
    await controller.start();
    await controller.chrome.clean.check();
    expect(badges.at(-1)).toBe(1);
    expect(daemon.count("clean.ackReminder")).toBe(0);
    await controller.chrome.clean.shown(["n"]);
    await controller.chrome.clean.shown(["n"]);
    expect(daemon.paramsOf("clean.ackReminder")).toEqual([{ playgroundId: "n" }]);
  });

  it("[DESKTOP-LIBRARY-VIEW-59] 改为保留：项目变为已保留，提示条和角标随之消失", async () => {
    const { daemon, controller, badges } = setup();
    daemon.playgrounds = [nodeTs()];
    await controller.start();
    await controller.chrome.clean.keep(["n"]);
    expect(daemon.paramsOf("clean.keep")).toEqual([{ playgroundId: "n" }]);
    const state = controller.getState();
    expect(state.playgrounds[0]?.autoClean.enabled).toBe(false);
    expect(state.cleanReminder).toEqual([]);
    expect(state.cleanDueCount).toBe(0);
    expect(badges.at(-1)).toBe(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-60] 稍后再说：提示条收起，角标仍是 1，该行仍算待清理；没有调用保留或清理", async () => {
    const { daemon, controller, badges } = setup();
    daemon.playgrounds = [nodeTs()];
    await controller.start();
    controller.chrome.clean.later(["n"]);
    const state = controller.getState();
    expect(state.cleanReminder).toEqual([]);
    expect(state.cleanDueCount).toBe(1);
    expect(badges.at(-1)).toBe(1);
    expect(daemon.count("clean.keep")).toBe(0);
    expect(daemon.count("playground.trash")).toBe(0);
  });

  it("[DESKTOP-LIBRARY-VIEW-60] 稍后再说只管这几个项目：之后新到期的项目照常出现在提示条里", async () => {
    const { daemon, controller } = setup();
    daemon.playgrounds = [nodeTs()];
    await controller.start();
    controller.chrome.clean.later(["n"]);
    daemon.playgrounds = [...daemon.playgrounds, nodeTs({ id: "m", name: "node-ts-2" })];
    await controller.refresh();
    expect((controller.getState().cleanReminder ?? []).map((item) => item.id)).toEqual(["m"]);
  });

  it("一轮检查：管理进程给出的可清理清单走移到废纸篓；问不到管理进程时什么都不做", async () => {
    const { daemon, controller } = setup();
    daemon.playgrounds = [nodeTs(), playground("a")];
    await controller.start();
    daemon.clean = ["n"];
    await controller.chrome.clean.check();
    expect(daemon.paramsOf("playground.trash")).toEqual([{ playground: "n" }]);
    expect(controller.getState().playgrounds.map((row) => row.id)).toEqual(["a"]);
  });
});

it("[DESKTOP-LIBRARY-VIEW-49] 打开前发现目录刚移走，更新索引并定位资源库而不运行", async () => {
  let exists = true;
  const { daemon, controller } = setup({ directoryExists: async () => exists });
  const original = playground("v", "demo");
  daemon.playgrounds = [original];
  daemon.onRescan = () => {
    daemon.playgrounds = [exists ? original : { ...original, missingSince: NOW }];
  };
  await controller.start();
  expect(daemon.count("library.rescan")).toBe(1);
  exists = false;
  await controller.openProject("v");
  expect(daemon.count("library.rescan")).toBe(2);
  expect(controller.getState().playgrounds[0]?.missing).toBe(true);
  expect(controller.getState().activeTab).toBe("library");
  expect(controller.getState().tabs).toEqual([]);
  expect(daemon.count("run.start")).toBe(0);
  await controller.checkProjectFolders();
  expect(daemon.count("library.rescan")).toBe(2);
  exists = true;
  await controller.checkProjectFolders();
  expect(daemon.count("library.rescan")).toBe(3);
  expect(controller.getState().playgrounds[0]?.missing).toBe(false);
});

it.each([false, true])(
  "[DESKTOP-LIBRARY-VIEW-49] 目录检查晚到（存在=%s）不覆盖后来选择的标签",
  async (present) => {
    let finish: (exists: boolean) => void = () => {};
    let checking = false;
    const { daemon, controller } = setup({
      directoryExists: (path) =>
        path.endsWith("/a") && !checking
          ? new Promise<boolean>((resolve) => {
              checking = true;
              finish = resolve;
            })
          : Promise.resolve(true),
    });
    const original = playground("a", "a");
    daemon.playgrounds = [original, playground("b", "b")];
    daemon.onRescan = () => {
      if (!present && checking)
        daemon.playgrounds = [{ ...original, missingSince: NOW }, playground("b", "b")];
    };
    await controller.start();
    await controller.openProjectWithoutRun("b");
    await controller.selectTab("library");
    const opening = controller.openProject("a");
    expect(checking).toBe(true);
    await controller.selectTab("b");
    finish(present);
    await opening;
    expect(controller.getState().activeTab).toBe("b");
    expect(controller.getState().libraryReveal).toBeUndefined();
    expect(controller.getState().tabs.map((tab) => tab.id)).toEqual(["b"]);
    expect(controller.getState().playgrounds.find((row) => row.id === "a")?.missing).toBe(!present);
    expect(daemon.count("run.start")).toBe(0);
  },
);
