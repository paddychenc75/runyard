import { describe, expect, it } from "vitest";
import { type CliHost, CliSettings, pathCommandFor } from "./cli-settings.ts";
import type { CliLinkResult, CliLinkState } from "./integration/cli-link.ts";

// 命令行与智能体在主进程一侧的逻辑：runyard 命令的状态和安装、诊断信息、技能包、管理进程。

const HOME = "/Users/me";
const BIN = `${HOME}/.local/bin`;
const LINK = `${BIN}/runyard`;

function setup(
  options: {
    link?: CliLinkState;
    onInstall?: CliLinkResult;
    loginPath?: string | null;
    run?: (args: string[]) => { code: number; stdout: string };
    existing?: string[];
    packaged?: boolean;
    openGuide?: (locale: "en" | "zh-CN") => Promise<boolean>;
    runs?: { owner: { kind: string } }[];
  } = {},
) {
  let state: CliLinkState = options.link ?? { status: "absent", link: LINK };
  const ran: string[][] = [];
  const revealed: string[] = [];
  const host: CliHost = {
    openSkillGuide: options.openGuide,
    runCli: async (args) => {
      ran.push(args);
      return options.run?.(args) ?? { code: 0, stdout: "{}" };
    },
    link:
      options.packaged === false
        ? null
        : {
            binDir: BIN,
            state: async () => state,
            install: async () => {
              const done = options.onInstall ?? { status: "installed", link: LINK, target: "/App" };
              if (done.status === "installed") state = { status: "current", link: LINK };
              return done;
            },
            uninstall: async () => {
              state = { status: "absent", link: LINK };
              return { status: "removed", link: LINK };
            },
          },
    loginPath: async () =>
      options.loginPath === undefined ? `/usr/bin:${BIN}` : options.loginPath,
    version: "0.1.0",
    home: HOME,
    exists: async (path) => (options.existing ?? []).includes(path),
    shellName: () => "zsh",
    revealInFileManager: (path) => void revealed.push(path),
  };
  const calls: { method: string; params: unknown }[] = [];
  const client = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      if (method === "run.list") return options.runs ?? [];
      return {};
    },
  };
  return { cli: new CliSettings(client as never, host), ran, revealed, calls };
}

describe("runyard 命令", () => {
  it("[DESKTOP-SETTINGS-20] 用户 bin 目录里没有 runyard：状态是 missing；安装后是 installed，带版本（与应用相同）和链接路径", async () => {
    const { cli } = setup();
    expect(await cli.status()).toMatchObject({ state: "missing", version: "0.1.0" });
    const outcome = await cli.install();
    expect(outcome.result).toBe("done");
    expect(outcome.status).toMatchObject({
      state: "installed",
      version: "0.1.0",
      path: "~/.local/bin/runyard",
      onPath: true,
    });
  });

  it("[DESKTOP-SETTINGS-21] 链接目录不在登录 shell 的 PATH 上：onPath 为 false，并给出一行可复制的加入命令", async () => {
    const { cli } = setup({ loginPath: "/usr/bin:/bin" });
    const { status } = await cli.install();
    expect(status.onPath).toBe(false);
    expect(status.pathCommand).toBe(`echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`);
  });

  it("读不到登录环境时不下“不在 PATH 上”的结论", async () => {
    const { cli } = setup({ loginPath: null });
    expect((await cli.install()).status.onPath).toBe(true);
  });

  it("[CLI-COMMANDS-82] 那个位置已有别人的文件：不安装，状态是 conflict", async () => {
    const { cli } = setup({
      link: { status: "conflict", link: LINK },
      onInstall: { status: "conflict", link: LINK },
    });
    const outcome = await cli.install();
    expect(outcome.result).toBe("conflict");
    expect(outcome.status.state).toBe("conflict");
  });

  it("链接指向旧位置的应用：状态是 stale，再安装一次就改指过来", async () => {
    const { cli } = setup({
      link: { status: "stale", link: LINK, target: "/Volumes/Old/Runyard.app" },
    });
    expect((await cli.status()).state).toBe("stale");
    expect((await cli.install()).status.state).toBe("installed");
  });

  it("移除之后回到 missing", async () => {
    const { cli } = setup({ link: { status: "current", link: LINK } });
    expect((await cli.remove()).status.state).toBe("missing");
  });

  it("从源码运行没有随包的命令行：unavailable，安装和移除都不动任何东西", async () => {
    const { cli } = setup({ packaged: false });
    expect((await cli.status()).state).toBe("unavailable");
    expect((await cli.install()).result).toBe("failed");
  });

  it("bash 用户的加入命令写进 ~/.bash_profile", () => {
    expect(pathCommandFor(BIN, HOME, "bash")).toContain("~/.bash_profile");
  });
});

describe("诊断信息", () => {
  it("[DESKTOP-SETTINGS-22] 做 runyard doctor --bundle 做的事，完成后在访达里选中生成的文件", async () => {
    const { cli, ran, revealed } = setup({
      run: () => ({
        code: 0,
        stdout: JSON.stringify({ bundle: "/tmp/runyard-doctor-1.zip", files: 5 }),
      }),
    });
    expect(await cli.exportDiagnostics()).toEqual({ ok: true });
    expect(ran).toEqual([["doctor", "--bundle", "--json"]]);
    expect(revealed).toEqual(["/tmp/runyard-doctor-1.zip"]);
  });

  it("命令行失败或输出不对：ok 为 false，不在访达里显示任何东西", async () => {
    const failed = setup({ run: () => ({ code: 1, stdout: "{}" }) });
    expect(await failed.cli.exportDiagnostics()).toEqual({ ok: false });
    const garbage = setup({ run: () => ({ code: 0, stdout: "not json" }) });
    expect(await garbage.cli.exportDiagnostics()).toEqual({ ok: false });
    expect(failed.revealed).toEqual([]);
    expect(garbage.revealed).toEqual([]);
  });
});

describe("智能体技能包", () => {
  it("[DESKTOP-SETTINGS-24] 装到了 Claude Code、没装到 Codex；选 Codex 安装就是 runyard skill install --target agents", async () => {
    const files = [`${HOME}/.claude/skills/runyard/SKILL.md`];
    const { cli, ran } = setup({ existing: files });
    expect(await cli.agentSkills()).toEqual({ claude: true, agents: false });
    await cli.installAgentSkill("agents");
    expect(ran).toEqual([["skill", "install", "--target", "agents", "--json"]]);
  });
});

describe("后台管理进程", () => {
  const cliRun = { owner: { kind: "cli" } };
  const tabRun = { owner: { kind: "tab" } };

  it("运行中：分别数命令行持有的和标签页持有的运行", async () => {
    const { cli } = setup({ runs: [cliRun, tabRun, cliRun] });
    expect(await cli.supervisorStatus()).toEqual({ running: true, cliRuns: 2, tabRuns: 1 });
  });

  it("[DESKTOP-SETTINGS-23] 停止：先停命令行持有的运行，再让管理进程退出", async () => {
    const { cli, calls } = setup({ runs: [cliRun, cliRun] });
    expect(await cli.stopSupervisor()).toEqual({ running: false, cliRuns: 0, tabRuns: 0 });
    expect(calls.map((call) => [call.method, call.params])).toEqual([
      ["run.stopAll", { mine: true }],
      ["supervisor.shutdown", { ifIdle: false, reason: "user" }],
    ]);
  });
});

it("[DESKTOP-SETTINGS-44] 只打开固定语言说明，未安装也可用且拒绝任意路径", async () => {
  const opened: string[] = [];
  const { cli, ran } = setup({
    openGuide: async (locale) => {
      opened.push(locale);
      return true;
    },
  });
  expect(await cli.openSkillGuide("zh-CN")).toEqual({ ok: true });
  expect(await cli.openSkillGuide("en")).toEqual({ ok: true });
  for (const bad of ["../../private.txt", "zh", "", undefined, {}, ["en"]])
    expect(await cli.openSkillGuide(bad)).toEqual({ ok: false });
  expect(opened).toEqual(["zh-CN", "en"]);
  expect(ran).toEqual([]);
});
it("查看说明失败反馈失败结果，不执行安装", async () => {
  const { cli, ran } = setup({
    openGuide: async () => {
      throw new Error("missing");
    },
  });
  expect(await cli.openSkillGuide("en")).toEqual({ ok: false });
  expect(ran).toEqual([]);
});
