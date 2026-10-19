// @vitest-environment jsdom

import type { ToolCheck } from "@runyard/protocol";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App.tsx";
import { type World, world } from "./settings-world.ts";

afterEach(cleanup);

const found = (tool: string, version: string, path: string, arch = "arm64"): ToolCheck => ({
  tool,
  status: "found",
  version,
  path,
  arch,
});
const goMissing: ToolCheck = {
  tool: "go",
  status: "missing",
  required: ">=1.22 <2",
  installCommand: "brew install go",
  installUrl: "https://go.dev/dl/",
};
const four = [
  found("node", "25.6.0", "/Users/me/.nvm/versions/node/v25.6.0/bin/node"),
  found("pnpm", "10.30.1", "/Users/me/.nvm/versions/node/v25.6.0/bin/pnpm"),
  found("python", "3.13.2", "/Users/me/.local/bin/python3", "x64"),
  goMissing,
];

async function openRuntime(w: World) {
  const user = userEvent.setup();
  w.bridge.bootstrap.windowKind = "settings";
  render(<App bridge={w.bridge} />);
  await screen.findByRole("heading", { name: "运行环境" });
  return user;
}
const rowOf = (name: string) =>
  screen.getByRole("rowheader", { name }).closest("tr") as HTMLElement;

describe("运行环境", () => {
  it("[DESKTOP-SETTINGS-41] 输入和粘贴期间不检测，回车保存新路径并更新版本架构", async () => {
    const w = world({
      on: {
        "toolchain.check": () => ({ tools: four }),
        "toolchain.setPath": () => ({
          status: "set",
          report: {
            tools: [found("node", "26.0.0", "/opt/Node Tools/node", "x64"), ...four.slice(1)],
          },
        }),
      },
    });
    const user = await openRuntime(w);
    const input = await screen.findByRole("textbox", { name: "Node 可执行文件路径" });
    const before = w.calls.length;
    await user.clear(input);
    await user.paste("/opt/Node Tools/node");
    expect(w.calls).toHaveLength(before);
    await user.keyboard("{Enter}");
    expect(w.calls.at(-1)).toEqual({
      method: "toolchain.setPath",
      param: { tool: "node", path: "/opt/Node Tools/node" },
    });
    await screen.findByText("26.0.0");
    expect(within(rowOf("Node")).getByText("x64")).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-42] 无效路径保留草稿和已生效版本，Esc 撤销且不保存", async () => {
    const w = world({
      on: {
        "toolchain.check": () => ({ tools: four }),
        "toolchain.setPath": (value) => ({ status: "invalid", ...(value as object) }),
      },
    });
    const user = await openRuntime(w);
    const input = await screen.findByRole("textbox", { name: "Node 可执行文件路径" });
    await user.clear(input);
    await user.type(input, "~/node{Enter}");
    expect(w.calls.some((call) => call.method === "toolchain.setPath")).toBe(false);
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.clear(input);
    await user.type(input, "/not-node{Enter}");
    expect(await screen.findByText("这个文件不是可用的 Node，原来的路径没有改")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("/not-node");
    expect(within(rowOf("Node")).getByText("25.6.0")).toBeTruthy();
    const count = w.calls.length;
    await user.keyboard("{Escape}");
    expect((input as HTMLInputElement).value).toBe(four[0]?.path);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(w.calls).toHaveLength(count);
  });

  it("[DESKTOP-SETTINGS-41] 检测更新和旧保存回包不覆盖新草稿，保存中回车不重复提交", async () => {
    let report = { tools: four };
    let finish = (_value: unknown) => {};
    const waiting = new Promise((resolve) => {
      finish = resolve;
    });
    const w = world({
      on: { "toolchain.check": () => report, "toolchain.setPath": () => waiting },
    });
    const user = await openRuntime(w);
    const input = await screen.findByRole("textbox", { name: "Node 可执行文件路径" });
    await user.clear(input);
    await user.type(input, "/draft/node");
    report = { tools: [found("node", "26.0.0", "/detected/node"), ...four.slice(1)] };
    act(() => w.emit("toolchain.changed", undefined));
    await screen.findByText("26.0.0");
    expect((input as HTMLInputElement).value).toBe("/draft/node");
    await user.keyboard("{Enter}{Enter}");
    expect(w.calls.filter((call) => call.method === "toolchain.setPath")).toHaveLength(1);
    await user.clear(input);
    await user.type(input, "/newer/node");
    await act(async () =>
      finish({
        status: "set",
        report: { tools: [found("node", "26.1.0", "/draft/node"), ...four.slice(1)] },
      }),
    );
    await screen.findByText("26.1.0");
    expect((input as HTMLInputElement).value).toBe("/newer/node");
    await user.keyboard("{Escape}");
    expect((input as HTMLInputElement).value).toBe("/draft/node");
  });

  it("[DESKTOP-SETTINGS-43] 输入法回车不提交，Tab 可达文件按钮，取消选择不改草稿，详情入口聚焦输入", async () => {
    const w = world({
      on: {
        "toolchain.check": () => ({ tools: four }),
        "toolchain.pickPath": () => ({ status: "cancelled" }),
      },
    });
    const user = await openRuntime(w);
    const input = await screen.findByRole("textbox", { name: "Node 可执行文件路径" });
    await user.clear(input);
    await user.type(input, "/draft/node");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(w.calls.some((call) => call.method === "toolchain.setPath")).toBe(false);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "选择 Node 可执行文件" }),
    );
    await user.keyboard("{Enter}");
    expect((input as HTMLInputElement).value).toBe("/draft/node");
    await user.click(screen.getByRole("button", { name: "Go" }));
    await user.click(
      within(screen.getByRole("region", { name: "Go" })).getByRole("button", { name: "指定路径…" }),
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Go 可执行文件路径" }));
  });

  it("[DESKTOP-SETTINGS-15] 表里只有用到的工具（node、pnpm、python、go），每行有版本、路径、芯片架构、状态和“指定路径…”", async () => {
    const w = world({ on: { "toolchain.check": () => ({ tools: four }) } });
    await openRuntime(w);
    await screen.findByRole("rowheader", { name: "Node" });
    const names = screen.getAllByRole("rowheader").map((cell) => cell.textContent);
    expect(names).toEqual(["Node", "pnpm", "Python", "Go"]);
    expect(screen.queryByRole("rowheader", { name: "ruby" })).toBeNull();
    const node = within(rowOf("Node"));
    expect(node.getByText("25.6.0")).toBeTruthy();
    expect(
      (node.getByRole("textbox", { name: "Node 可执行文件路径" }) as HTMLInputElement).value,
    ).toBe("/Users/me/.nvm/versions/node/v25.6.0/bin/node");
    expect(node.getByText("arm64")).toBeTruthy();
    expect(node.getByText("已找到")).toBeTruthy();
    expect(within(rowOf("Python")).getByText("x64")).toBeTruthy();
    for (const tool of ["Node", "pnpm", "Python", "Go"]) {
      expect(within(rowOf(tool)).getByRole("button", { name: `指定路径… ${tool}` })).toBeTruthy();
    }
    expect(within(rowOf("Go")).getByText("未安装")).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-16] 先立即显示缓存的结果，后台检测完（2 秒）再更新表格；打开页面不等检测", async () => {
    let finishLive: (tools: ToolCheck[]) => void = () => {};
    const live = new Promise<{ tools: ToolCheck[] }>((resolve) => {
      finishLive = (tools) => resolve({ tools });
    });
    const w = world({
      on: {
        "toolchain.check": (param) =>
          (param as { cachedOnly: boolean }).cachedOnly
            ? { tools: [found("node", "24.0.0", "/usr/local/bin/node")] }
            : live,
      },
    });
    await openRuntime(w);
    expect(
      await within(await screen.findByRole("table", { name: "运行环境" })).findByText("24.0.0"),
    ).toBeTruthy();
    await act(async () => finishLive([found("node", "25.6.0", "/usr/local/bin/node")]));
    await waitFor(() => expect(screen.getByText("25.6.0")).toBeTruthy());
    expect(screen.queryByText("24.0.0")).toBeNull();
    const calls = w.calls.filter((c) => c.method === "toolchain.check").map((c) => c.param);
    expect(calls).toEqual([{ cachedOnly: true }, { cachedOnly: false }]);
  });

  it("[DESKTOP-SETTINGS-16] 管理进程说检测结果变了（toolchain.changed）：表格重读缓存并更新", async () => {
    let version = "24.0.0";
    const w = world({
      on: { "toolchain.check": () => ({ tools: [found("node", version, "/usr/local/bin/node")] }) },
    });
    await openRuntime(w);
    await screen.findByText("24.0.0");
    version = "26.0.0";
    act(() => w.emit("toolchain.changed", undefined));
    await screen.findByText("26.0.0");
  });

  it("[DESKTOP-SETTINGS-17] 点缺少的 go 那一行：展开需要的版本、未安装、安装命令、官网和四个操作", async () => {
    const w = world({ on: { "toolchain.check": () => ({ tools: four }) } });
    const user = await openRuntime(w);
    await user.click(await screen.findByRole("button", { name: "Go" }));
    const detail = await screen.findByRole("region", { name: "Go" });
    const view = within(detail);
    expect(view.getByRole("heading", { name: "没有找到 Go" })).toBeTruthy();
    expect(view.getByText("Go ≥ 1.22 且 < 2")).toBeTruthy();
    expect(view.getByText("未安装")).toBeTruthy();
    expect(view.getByText("brew install go")).toBeTruthy();
    expect(view.getByRole("button", { name: "go.dev/dl" })).toBeTruthy();
    for (const name of ["复制命令", "在终端中运行", "重新检测", "指定路径…"]) {
      expect(view.getByRole("button", { name })).toBeTruthy();
    }
    await user.click(view.getByRole("button", { name: "复制命令" }));
    await user.click(view.getByRole("button", { name: "在终端中运行" }));
    await user.click(view.getByRole("button", { name: "go.dev/dl" }));
    expect(
      w.calls.filter((c) =>
        ["clipboard.copy", "toolchain.runInstall", "link.open"].includes(c.method),
      ),
    ).toEqual([
      { method: "clipboard.copy", param: "brew install go" },
      { method: "toolchain.runInstall", param: "go" },
      { method: "link.open", param: "https://go.dev/dl/" },
    ]);
  });

  it("[DESKTOP-SETTINGS-17] 版本过低的工具也能展开，“当前”写出现在的版本", async () => {
    const old: ToolCheck = {
      ...found("node", "18.0.0", "/usr/local/bin/node"),
      status: "too-old",
      required: ">=22",
    };
    const w = world({ on: { "toolchain.check": () => ({ tools: [old] }) } });
    const user = await openRuntime(w);
    await user.click(await screen.findByRole("button", { name: "Node" }));
    const view = within(await screen.findByRole("region", { name: "Node" }));
    expect(view.getByRole("heading", { name: "Node 的版本过低" })).toBeTruthy();
    expect(view.getByText("18.0.0")).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-18] 在 node 那一行指定了一个打印不出版本号的文件：写明不是可用的 node，原来的路径不变", async () => {
    const w = world({
      on: {
        "toolchain.check": () => ({ tools: four }),
        "toolchain.pickPath": (tool) => ({ status: "invalid", tool, path: "/Users/me/not-node" }),
      },
    });
    const user = await openRuntime(w);
    await user.click(await screen.findByRole("button", { name: "选择 Node 可执行文件" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("这个文件不是可用的 Node，原来的路径没有改");
    expect((within(rowOf("Node")).getByRole("textbox") as HTMLInputElement).value).toBe(
      four[0]?.path,
    );
    expect(w.calls.find((c) => c.method === "toolchain.pickPath")?.param).toBe("node");
  });

  it("[DESKTOP-SETTINGS-18] 选了可用的文件：表格换成新结果，提示消失；取消选择什么都不变", async () => {
    let answer: unknown = { status: "cancelled" };
    const w = world({
      on: { "toolchain.check": () => ({ tools: four }), "toolchain.pickPath": () => answer },
    });
    const user = await openRuntime(w);
    const button = await screen.findByRole("button", { name: "选择 Node 可执行文件" });
    await user.click(button);
    expect(screen.queryByRole("alert")).toBeNull();
    answer = {
      status: "set",
      report: {
        tools: [
          found("node", "26.0.0", "/opt/node/bin/node"),
          ...four.slice(1),
          found("ruby", "3.3.0", "/usr/bin/ruby"),
        ],
      },
    };
    await user.click(button);
    await screen.findByText("26.0.0");
    expect(screen.queryByRole("rowheader", { name: "ruby" })).toBeNull();
  });

  it("[DESKTOP-SETTINGS-19] 读不到终端环境：表上方写“没能读取你终端的环境，可能不准”，有“重新检测”和“指定路径…”", async () => {
    const guessed = four.map((tool) => ({ ...tool, source: "fallback" as const }));
    const w = world({
      on: {
        "toolchain.check": () => ({ tools: guessed }),
        "toolchain.recheck": () => ({ tools: four }),
      },
    });
    const user = await openRuntime(w);
    const banner = await screen.findByText("没能读取你终端的环境，可能不准");
    const status = banner.closest("[role=status]") as HTMLElement;
    expect(within(status).getByRole("button", { name: "重新检测" })).toBeTruthy();
    expect(within(status).getByRole("button", { name: "指定路径…" })).toBeTruthy();
    await user.click(within(status).getByRole("button", { name: "重新检测" }));
    await waitFor(() => expect(screen.queryByText("没能读取你终端的环境，可能不准")).toBeNull());
  });

  it("环境读得到时不显示“可能不准”；右上角“重新检测”调用 toolchain.recheck", async () => {
    const w = world({ on: { "toolchain.check": () => ({ tools: four }) } });
    const user = await openRuntime(w);
    await screen.findByRole("rowheader", { name: "Node" });
    expect(screen.queryByText("没能读取你终端的环境，可能不准")).toBeNull();
    const group = screen
      .getByRole("heading", { name: "运行环境" })
      .closest("section") as HTMLElement;
    await user.click(within(group).getByRole("button", { name: "重新检测" }));
    await waitFor(() => expect(w.calls.some((c) => c.method === "toolchain.recheck")).toBe(true));
    expect(
      screen.getByText("只有创建或打开项目时才会检查它需要的工具。Runyard 不会替你安装。"),
    ).toBeTruthy();
  });
});
