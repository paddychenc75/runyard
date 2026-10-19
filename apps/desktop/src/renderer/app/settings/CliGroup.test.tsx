// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { CliCommandStatus } from "../../../shared/settings-bridge.ts";
import { App } from "../App.tsx";
import { type World, world } from "./settings-world.ts";

afterEach(cleanup);

const missing: CliCommandStatus = {
  state: "missing",
  version: "0.1.0",
  onPath: false,
  pathCommand: "echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> ~/.zshrc",
};
const installed: CliCommandStatus = {
  ...missing,
  state: "installed",
  path: "~/.local/bin/runyard",
  onPath: true,
};

async function openCli(w: World) {
  const user = userEvent.setup();
  w.bridge.bootstrap.windowKind = "settings";
  render(<App bridge={w.bridge} />);
  await screen.findByRole("heading", { name: "命令行与智能体" });
  return user;
}
const group = () =>
  screen.getByRole("heading", { name: "命令行与智能体" }).closest("section") as HTMLElement;

describe("命令行与智能体", () => {
  it("[DESKTOP-SETTINGS-20] 用户 bin 目录里没有 runyard：点“安装命令行工具”，这一行变为“可用”，写出版本和链接路径", async () => {
    let status = missing;
    const w = world({
      on: {
        "cli.status": () => status,
        "cli.install": () => {
          status = installed;
          return { result: "done", status };
        },
      },
    });
    const user = await openCli(w);
    await screen.findByRole("button", { name: "安装命令行工具" });
    await user.click(screen.getByRole("button", { name: "安装命令行工具" }));
    expect(await screen.findByText("可用 · 0.1.0")).toBeTruthy();
    expect(screen.getByText("~/.local/bin/runyard")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "安装命令行工具" })).toBeNull();
    expect(screen.getByRole("button", { name: "移除" })).toBeTruthy();
    expect(screen.queryByText(/不在 PATH 上/)).toBeNull();
  });

  it("移除：只发 cli.remove，之后回到“未安装”", async () => {
    let status = installed;
    const w = world({
      on: {
        "cli.status": () => status,
        "cli.remove": () => {
          status = missing;
          return { result: "done", status };
        },
      },
    });
    const user = await openCli(w);
    await user.click(await screen.findByRole("button", { name: "移除" }));
    await screen.findByRole("button", { name: "安装命令行工具" });
    expect(w.calls.filter((c) => c.method === "cli.remove")).toHaveLength(1);
  });

  it("[DESKTOP-SETTINGS-21] 链接目录不在 PATH 上：写明，并给一行可复制的加入命令", async () => {
    const offPath: CliCommandStatus = { ...installed, onPath: false };
    const w = world({ on: { "cli.status": () => offPath } });
    const user = await openCli(w);
    const note = await screen.findByText(/~\/\.local\/bin 不在 PATH 上/);
    expect(note).toBeTruthy();
    const hint = note.closest("[role=status]") as HTMLElement;
    expect(within(hint).getByText(offPath.pathCommand)).toBeTruthy();
    await user.click(within(hint).getByRole("button", { name: "复制命令" }));
    expect(w.calls.find((c) => c.method === "clipboard.copy")?.param).toBe(offPath.pathCommand);
  });

  it("那个位置已有别的文件：写明没有动它，不给安装按钮", async () => {
    const w = world({
      on: { "cli.status": () => ({ ...missing, state: "conflict", path: "~/.local/bin/runyard" }) },
    });
    await openCli(w);
    expect(await screen.findByText("位置被占用")).toBeTruthy();
    expect(screen.getByText("那个位置已经有别的文件，没有动它")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "安装命令行工具" })).toBeNull();
  });

  it("从源码运行时没有随包的命令行：写明，不给按钮", async () => {
    const w = world();
    await openCli(w);
    expect(await screen.findByText("仅安装版可用")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "安装命令行工具" })).toBeNull();
  });

  it("[DESKTOP-SETTINGS-22] 点“导出诊断信息…”：调用 diagnostics.export，完成后写“已导出”", async () => {
    const w = world({ on: { "diagnostics.export": () => ({ ok: true }) } });
    const user = await openCli(w);
    await user.click(within(group()).getByRole("button", { name: "导出诊断信息…" }));
    expect(await screen.findByText("已导出")).toBeTruthy();
    expect(w.calls.filter((c) => c.method === "diagnostics.export")).toHaveLength(1);
  });

  it("[DESKTOP-SETTINGS-22] 导出失败时写明", async () => {
    const w = world({ on: { "diagnostics.export": () => ({ ok: false }) } });
    const user = await openCli(w);
    await user.click(within(group()).getByRole("button", { name: "导出诊断信息…" }));
    expect(await screen.findByText("导出失败")).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-23] 有 2 个命令行持有、1 个标签页持有的运行：点“停止”先确认，写明两种运行都会停；取消什么都不变", async () => {
    const w = world({
      on: { "supervisor.status": () => ({ running: true, cliRuns: 2, tabRuns: 1 }) },
    });
    const user = await openCli(w);
    expect(await screen.findByText("运行中 · 2 个由命令行启动")).toBeTruthy();
    await user.click(within(group()).getByRole("button", { name: "停止" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/这会停止全部运行：2 个由命令行启动，1 个在标签页里运行/),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(w.calls.some((c) => c.method === "supervisor.stop")).toBe(false);
    expect(screen.getByText("运行中 · 2 个由命令行启动")).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-23] 确认后才停：发 supervisor.stop，状态变成“未运行”", async () => {
    const w = world({
      on: {
        "supervisor.status": () => ({ running: true, cliRuns: 2, tabRuns: 1 }),
        "supervisor.stop": () => ({ running: false, cliRuns: 0, tabRuns: 0 }),
      },
    });
    const user = await openCli(w);
    await screen.findByText("运行中 · 2 个由命令行启动");
    await user.click(within(group()).getByRole("button", { name: "停止" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "停止" }));
    expect(await screen.findByText("未运行")).toBeTruthy();
    expect(w.calls.filter((c) => c.method === "supervisor.stop")).toHaveLength(1);
  });

  it("[DESKTOP-SETTINGS-23] 只有标签页持有的运行时也要确认：这些运行同样会停", async () => {
    const w = world({
      on: { "supervisor.status": () => ({ running: true, cliRuns: 0, tabRuns: 1 }) },
    });
    const user = await openCli(w);
    await screen.findByText("运行中");
    await user.click(within(group()).getByRole("button", { name: "停止" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/0 个由命令行启动，1 个在标签页里运行/)).toBeTruthy();
  });

  it("一个运行都没有时不弹确认，直接停", async () => {
    const w = world({
      on: {
        "supervisor.status": () => ({ running: true, cliRuns: 0, tabRuns: 0 }),
        "supervisor.stop": () => ({ running: false, cliRuns: 0, tabRuns: 0 }),
      },
    });
    const user = await openCli(w);
    await screen.findByText("运行中");
    await user.click(within(group()).getByRole("button", { name: "停止" }));
    expect(await screen.findByText("未运行")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("[DESKTOP-SETTINGS-24] 技能包已装到 Claude Code、没装到 Codex：写“已安装到 Claude Code”；菜单里选 Codex 并安装", async () => {
    let skills = { claude: true, agents: false };
    const w = world({
      on: {
        "agents.status": () => skills,
        "agents.install": (target) => {
          skills = { ...skills, [target as "agents"]: true };
          return skills;
        },
      },
    });
    const user = await openCli(w);
    expect(await screen.findByText("已安装到 Claude Code")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "安装到其他智能体…" }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual(["Claude Code", "Codex"]);
    await user.click(items[1] as HTMLElement);
    expect(await screen.findByText("已安装到 Claude Code 和 Codex")).toBeTruthy();
    expect(w.calls.find((c) => c.method === "agents.install")?.param).toBe("agents");
  });

  it("[DESKTOP-SETTINGS-25] 内置模板免确认默认关，不再有“随 #195 提供”的占位", async () => {
    const w = world();
    await openCli(w);
    const toggle = screen.getByRole("switch", { name: "来自链接的新建请求：内置模板免确认" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(/#195/)).toBeNull();
  });
});

it("[DESKTOP-SETTINGS-44] 未安装也能按界面语言查看说明，不触发安装", async () => {
  const seen: unknown[] = [];
  const w = world({
    on: {
      "agents.status": () => ({ claude: false, agents: false }),
      "agents.openGuide": (locale: unknown) => {
        seen.push(locale);
        return { ok: true };
      },
    },
  });
  const user = await openCli(w);
  await user.click(await screen.findByRole("button", { name: "查看说明" }));
  expect(seen).toEqual(["zh-CN"]);
  await user.click(screen.getByRole("button", { name: "English" }));
  await user.click(await screen.findByRole("button", { name: "View guide" }));
  expect(seen).toEqual(["zh-CN", "en"]);
  expect(w.calls.some(({ method }) => method === "agents.install")).toBe(false);
});
