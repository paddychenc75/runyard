import { clientError } from "@runyard/client";
import type { MethodName, MethodParams, MethodResult } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { type LibraryClient, LibraryController, type PreviewHost } from "./library-controller.ts";
import { playground, run, template } from "./library-fixtures.ts";

// 创建后的启动进度（规格 desktop/create-flow 14 至 16）：用假客户端和假时钟走一遍“创建并运行”
class FakeClient {
  calls: string[] = [];
  playgrounds = [playground("a", "react19-4")];
  runs: ReturnType<typeof run>[] = [];
  startFailure: Error | undefined;
  /** 每次调用前执行，测试用它推动假时钟 */
  beforeCall: ((method: string) => void) | undefined;

  call = async <M extends MethodName>(
    method: M,
    _params: MethodParams<M>,
  ): Promise<MethodResult<M>> => {
    this.calls.push(method);
    this.beforeCall?.(method);
    if (method === "run.start" && this.startFailure !== undefined) throw this.startFailure;
    const results: Record<string, unknown> = {
      "playground.list": this.playgrounds,
      "run.list": this.runs,
      "template.list": [template("react19"), template("html")],
      "settings.get": { libraryRoot: "/home/u/Runyard" },
      "run.start": run("a", "checking"),
      "playground.create": { playground: this.playgrounds[0], created: true },
      "logs.read": { entries: [], cursor: "r:1", truncated: false },
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
};

function setup() {
  const client = new FakeClient();
  const clock = { at: 10_000 };
  const controller = new LibraryController({
    client: client as unknown as LibraryClient,
    clientId: "app-1",
    home: "/lib",
    locale: "zh-CN",
    preview,
    system: { revealInFileManager() {}, copyText() {}, openExternal() {} },
    now: () => clock.at,
  });
  return { client, clock, controller };
}

const request = { template: "react19", name: "react19-4", note: "", autoClean: null } as const;
const tabOf = (controller: LibraryController) => controller.getState().tabs[0];

describe("创建后的启动进度（主进程的数据）", () => {
  it("[DESKTOP-CREATE-FLOW-14] 创建后立即打开标签页并启动运行，标签带着各步用时和文件夹", async () => {
    const { client, clock, controller } = setup();
    await controller.start();
    expect(await controller.create(request)).toEqual({ ok: true });
    expect(controller.getState().activeTab).toBe("a");
    expect(client.calls).toContain("run.start");
    // 运行随事件一步步推进：检查、安装、启动、就绪
    client.runs = [run("a", "checking")];
    await controller.refresh();
    expect(tabOf(controller)).toMatchObject({ state: "checking", folder: "~/react19-4" });
    clock.at += 300;
    client.runs = [run("a", "installing")];
    await controller.refresh();
    clock.at += 700;
    client.runs = [run("a", "starting")];
    await controller.refresh();
    expect(tabOf(controller)?.phaseMs).toMatchObject({ install: 700, start: null });
    clock.at += 1_500;
    client.runs = [run("a", "ready", { url: "http://127.0.0.1:7101/", port: 7101 })];
    await controller.refresh();
    expect(tabOf(controller)).toMatchObject({
      previewUrl: "http://127.0.0.1:7101/",
      phaseMs: { install: 700, start: 1_500 },
    });
  });

  it("[DESKTOP-CREATE-FLOW-14] 复制模板文件的用时取创建请求自己的耗时", async () => {
    const { clock, controller, client } = setup();
    await controller.start();
    client.beforeCall = (method) => {
      if (method === "playground.create") clock.at += 140;
    };
    await controller.create(request);
    client.runs = [run("a", "checking")];
    await controller.refresh();
    expect(tabOf(controller)?.phaseMs.copy).toBe(140);
  });

  it("[DESKTOP-CREATE-FLOW-15] 工具缺失：创建成功、项目在资源库里、标签带缺工具的失败，不是创建失败", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.startFailure = clientError(
      "TOOL_MISSING",
      { tool: "node", required: ">=22" },
      "node is missing",
    );
    client.runs = [run("a", "failed", { reason: "TOOL_MISSING" })];
    const result = await controller.create(request);
    await controller.refresh();
    expect(result).toEqual({ ok: true });
    const state = controller.getState();
    expect(state.playgrounds.map((row) => row.name)).toEqual(["react19-4"]);
    expect(state.tabs[0]?.failure).toEqual({
      code: "TOOL_MISSING",
      params: { tool: "node", required: ">=22" },
    });
    expect(state.error).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-16] 创建并运行不检查别的工具：只有运行请求，没有任何工具链调用，也没有失败", async () => {
    const { client, controller } = setup();
    await controller.start();
    client.runs = [run("a", "ready", { url: "http://127.0.0.1:7101/", port: 7101 })];
    await controller.create({ ...request, template: "html" });
    await controller.refresh();
    expect(client.calls.filter((method) => method.startsWith("toolchain."))).toEqual([]);
    expect(tabOf(controller)?.failure).toBeNull();
    expect(controller.getState().error).toBeNull();
  });
});
