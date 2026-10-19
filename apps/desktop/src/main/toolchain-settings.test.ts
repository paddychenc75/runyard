import type { ToolCheck } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import { parseNpmrc, type ToolchainHost, ToolchainSettings } from "./toolchain-settings.ts";

// 依赖与网络、运行环境在主进程一侧的逻辑：读本机 .npmrc、指定路径、只运行检测结果里报告的安装命令。

class ClientError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function setup(options: {
  npmrc?: string | null;
  picked?: string | null;
  setPath?: (params: { tool: string; path: string }) => unknown;
  tools?: ToolCheck[];
}) {
  const terminal: string[] = [];
  const calls: { method: string; params: unknown }[] = [];
  const host: ToolchainHost = {
    chooseExecutable: async () => options.picked ?? null,
    runInTerminal: (command) => void terminal.push(command),
    readNpmrc: async () => options.npmrc ?? null,
  };
  const client = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      if (method === "toolchain.setPath") {
        return options.setPath?.(params as { tool: string; path: string });
      }
      return { tools: options.tools ?? [] };
    },
    subscribe: async () => ({ unsubscribe: async () => {} }),
  };
  return { settings: new ToolchainSettings(client as never, host), terminal, calls };
}

describe("本机的镜像源和代理（.npmrc）", () => {
  it("[DESKTOP-SETTINGS-13] 读出本机配置的镜像源，清空设置里的值后输入框显示它", async () => {
    const { settings } = setup({
      npmrc: "registry=https://a.example/\n//a.example/:_authToken=secret\n",
    });
    expect(await settings.localNetwork()).toEqual({ registry: "https://a.example/" });
  });

  it("读出代理；忽略注释、引号、空值和不是地址的写法", () => {
    expect(parseNpmrc('# registry=https://x\nregistry="https://b.example"\nproxy=\n')).toEqual({
      registry: "https://b.example",
    });
    expect(parseNpmrc("https-proxy=http://127.0.0.1:7890\nproxy=http://other:1")).toEqual({
      proxy: "http://127.0.0.1:7890",
    });
    expect(parseNpmrc("registry=${REGISTRY}")).toEqual({});
    expect(parseNpmrc(null)).toEqual({});
  });

  it("没有 .npmrc 就是空，不报错", async () => {
    expect(await setup({}).settings.localNetwork()).toEqual({});
  });
});

describe("指定路径", () => {
  it("[DESKTOP-SETTINGS-18] 管理进程说不是可用的工具：返回 invalid，带上选的路径", async () => {
    const { settings } = setup({
      picked: "/Users/me/not-node",
      setPath: () => {
        throw new ClientError("TOOL_PATH_INVALID");
      },
    });
    expect(await settings.pickPath("node")).toEqual({
      status: "invalid",
      tool: "node",
      path: "/Users/me/not-node",
    });
  });

  it("接受了就返回新的检测结果；取消选择不调用管理进程；别的失败是 failed", async () => {
    const accepted = setup({ picked: "/opt/node", setPath: () => ({ tools: [] }) });
    expect(await accepted.settings.pickPath("node")).toEqual({
      status: "set",
      report: { tools: [] },
    });
    const cancelled = setup({ picked: null });
    expect(await cancelled.settings.pickPath("node")).toEqual({ status: "cancelled" });
    expect(cancelled.calls).toEqual([]);
    const broken = setup({
      picked: "/opt/node",
      setPath: () => {
        throw new ClientError("SUPERVISOR_UNAVAILABLE");
      },
    });
    expect(await broken.settings.pickPath("node")).toEqual({ status: "failed" });
  });
});

describe("在终端中运行安装命令", () => {
  const go: ToolCheck = { tool: "go", status: "missing", installCommand: "brew install go" };

  it("只运行最近一次检测结果里报告的那一条命令", async () => {
    const { settings, terminal } = setup({ tools: [go] });
    await settings.check(false);
    settings.runInstall("go");
    expect(terminal).toEqual(["brew install go"]);
  });

  it("没报告过的工具、界面自己编的工具名都不运行任何东西", async () => {
    const { settings, terminal } = setup({ tools: [go] });
    settings.runInstall("go");
    await settings.check(false);
    settings.runInstall("rm -rf /");
    settings.runInstall("node");
    expect(terminal).toEqual([]);
  });

  it("工具装好之后新的检测结果不再带命令，就不能再运行旧的", async () => {
    const h = setup({ tools: [go] });
    await h.settings.check(false);
    const fixed = setup({ tools: [{ tool: "go", status: "found" }] });
    await fixed.settings.check(false);
    fixed.settings.runInstall("go");
    expect(fixed.terminal).toEqual([]);
  });
});

it("[DESKTOP-SETTINGS-41] 输入完整含空格路径沿用既有验证，作为单个 path 字段提交", async () => {
  const h = setup({ setPath: () => ({ tools: [] }) });
  expect(await h.settings.setPath("node", "/Applications/Node Tools/bin/node")).toEqual({
    status: "set",
    report: { tools: [] },
  });
  expect(h.calls).toEqual([
    {
      method: "toolchain.setPath",
      params: { tool: "node", path: "/Applications/Node Tools/bin/node" },
    },
  ]);
});

it("[DESKTOP-SETTINGS-42] 非绝对路径和控制字符在调用管理进程前拒绝，不执行 shell 展开", async () => {
  const h = setup({});
  for (const path of [
    "",
    "node",
    "~/bin/node",
    "$HOME/bin/node",
    "/bin/node\n--version",
    "/bin/node\0",
  ]) {
    expect(await h.settings.setPath("node", path)).toEqual({
      status: "invalid",
      tool: "node",
      path,
    });
  }
  expect(h.calls).toEqual([]);
});
