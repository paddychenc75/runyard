// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { CliCommandStatus, SkillState } from "../../../shared/settings-bridge.ts";
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

const skillStatus = (claude: SkillState, agents: SkillState) => ({ claude, agents });

async function openCli(w: World) {
  const user = userEvent.setup();
  render(<App bridge={w.bridge} />);
  await user.click(await screen.findByRole("button", { name: "\u8bbe\u7f6e" }));
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
    await within(group()).findByText("运行中");
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
    await within(group()).findByText("运行中");
    await user.click(within(group()).getByRole("button", { name: "停止" }));
    expect(await screen.findByText("未运行")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("[DESKTOP-SETTINGS-24] 技能包已装到 Claude Code、没装到 Codex：写“已装到 Claude Code”，情境按钮是“安装到 Codex”，点它安装", async () => {
    let skills = skillStatus("current", "missing");
    const w = world({
      on: {
        "agents.status": () => skills,
        "agents.install": (target) => {
          skills = { ...skills, [target as "agents"]: "current" };
          return { status: skills };
        },
      },
    });
    const user = await openCli(w);
    expect(await screen.findByText("已装到 Claude Code")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "安装到 Codex" }));
    expect(await screen.findByText("Claude Code、Codex")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /安装到/ })).toBeNull();
    expect(w.calls.find((c) => c.method === "agents.install")?.param).toBe("agents");
  });

  it("[DESKTOP-SETTINGS-54] 命令行与智能体整组的状态都是小号次要文字加小状态点", async () => {
    const w = world({
      on: {
        "cli.status": () => installed,
        "supervisor.status": () => ({ running: true, cliRuns: 0, tabRuns: 0 }),
        "agents.status": () => skillStatus("current", "missing"),
      },
    });
    await openCli(w);
    const lines = await within(group()).findAllByText(/可用 · 0\.1\.0|运行中|已装到 Claude Code/);
    expect(lines).toHaveLength(3);
    for (const line of lines)
      expect(line.closest("[data-tone]")?.getAttribute("data-tone")).toBe("ok");
  });

  it("[DESKTOP-SETTINGS-55] 未安装：“未安装”加“安装…”下拉，选 Codex 就只装到 Codex；说明末尾是“查看说明”链接", async () => {
    let skills = skillStatus("missing", "missing");
    const w = world({
      on: {
        "agents.status": () => skills,
        "agents.install": (target) => {
          skills = { ...skills, [target as "agents"]: "current" };
          return { status: skills };
        },
      },
    });
    const user = await openCli(w);
    expect(await screen.findByText("未安装", { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看说明" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "安装…" }));
    const names = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(names).toEqual(["Claude Code", "Codex"]);
    await user.click(screen.getByRole("menuitem", { name: "Codex" }));
    expect(await screen.findByText("已装到 Codex")).toBeTruthy();
    expect(w.calls.filter((c) => c.method === "agents.install").map((c) => c.param)).toEqual([
      "agents",
    ]);
  });

  it("[DESKTOP-SETTINGS-56] 全部装好：只剩状态和“⋯”，没有情境按钮", async () => {
    const w = world({ on: { "agents.status": () => skillStatus("current", "current") } });
    await openCli(w);
    expect(await screen.findByText("Claude Code、Codex")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^安装|^更新|^重试/ })).toBeNull();
    expect(screen.getByRole("button", { name: "智能体技能包的更多操作" })).toBeTruthy();
  });

  it("[DESKTOP-SETTINGS-57] 有新版本：黄点“有新版本”加“更新”，说明写更新会覆盖改过的文件；点更新装回当前版本", async () => {
    let skills = skillStatus("outdated", "current");
    const w = world({
      on: {
        "agents.status": () => skills,
        "agents.install": () => {
          skills = skillStatus("current", "current");
          return { status: skills };
        },
      },
    });
    const user = await openCli(w);
    expect(await screen.findByText("有新版本")).toBeTruthy();
    expect(screen.getByText(/更新会覆盖你改过的技能文件/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "更新" }));
    expect(await screen.findByText("Claude Code、Codex")).toBeTruthy();
    expect(w.calls.filter((c) => c.method === "agents.install").map((c) => c.param)).toEqual([
      "claude",
    ]);
    expect(screen.queryByText(/更新会覆盖/)).toBeNull();
  });

  it("[DESKTOP-SETTINGS-58] 安装失败：红叉“安装失败”加“重试”，说明行红字写原因；重试成功后恢复", async () => {
    let attempt = 0;
    const w = world({
      on: {
        "agents.status": () => skillStatus("current", "missing"),
        "agents.install": () => {
          attempt += 1;
          return attempt === 1
            ? {
                status: skillStatus("current", "missing"),
                failure: { target: "agents", reason: "permission" },
              }
            : { status: skillStatus("current", "current") };
        },
      },
    });
    const user = await openCli(w);
    await user.click(await screen.findByRole("button", { name: "安装到 Codex" }));
    expect(await screen.findByText("没能装到 Codex：~/.agents/skills 没有写入权限")).toBeTruthy();
    expect(screen.getByText("安装失败").closest("[data-tone]")?.getAttribute("data-tone")).toBe(
      "danger",
    );
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("Claude Code、Codex")).toBeTruthy();
    expect(screen.queryByText(/没能装到/)).toBeNull();
  });

  it("[DESKTOP-SETTINGS-59] “⋯”菜单按位置分组：已装的有重新安装、在访达中显示、移除…；没装的有安装；键盘可达", async () => {
    const w = world({ on: { "agents.status": () => skillStatus("current", "missing") } });
    const user = await openCli(w);
    const more = await screen.findByRole("button", { name: "智能体技能包的更多操作" });
    more.focus();
    await user.keyboard("{Enter}");
    const claude = await screen.findByRole("group", { name: "Claude Code · 已安装" });
    expect(
      within(claude)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["重新安装", "在访达中显示", "移除…"]);
    const codex = screen.getByRole("group", { name: "Codex · 未安装" });
    expect(
      within(codex)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["安装"]);
    await user.click(within(claude).getByRole("menuitem", { name: "在访达中显示" }));
    expect(w.calls.find((c) => c.method === "agents.reveal")?.param).toBe("claude");
  });

  it("[DESKTOP-SETTINGS-60] 移除要先确认；取消什么都不变，确认后只移除那一个位置", async () => {
    let skills = skillStatus("current", "current");
    const w = world({
      on: {
        "agents.status": () => skills,
        "agents.remove": (target) => {
          skills = { ...skills, [target as "agents"]: "missing" };
          return { status: skills };
        },
      },
    });
    const user = await openCli(w);
    const openRemove = async () => {
      await user.click(await screen.findByRole("button", { name: "智能体技能包的更多操作" }));
      const codex = await screen.findByRole("group", { name: "Codex · 已安装" });
      await user.click(within(codex).getByRole("menuitem", { name: "移除…" }));
    };
    await openRemove();
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(w.calls.some((c) => c.method === "agents.remove")).toBe(false);
    await openRemove();
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "移除" }),
    );
    expect(await screen.findByText("已装到 Claude Code")).toBeTruthy();
    expect(w.calls.filter((c) => c.method === "agents.remove").map((c) => c.param)).toEqual([
      "agents",
    ]);
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
      "agents.status": () => skillStatus("missing", "missing"),
      "agents.openGuide": (locale: unknown) => {
        seen.push(locale);
        return { ok: true, content: locale === "zh-CN" ? "中文技能说明" : "English skill guide" };
      },
    },
  });
  const user = await openCli(w);
  await user.click(await screen.findByRole("button", { name: "查看说明" }));
  expect(await screen.findByText("中文技能说明")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "关闭说明" }));
  expect(seen).toEqual(["zh-CN"]);
  await user.click(screen.getByRole("button", { name: "English" }));
  await user.click(await screen.findByRole("button", { name: "View guide" }));
  expect(await screen.findByText("English skill guide")).toBeTruthy();
  expect(seen).toEqual(["zh-CN", "en"]);
  expect(w.calls.some(({ method }) => method === "agents.install")).toBe(false);
});
