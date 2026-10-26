import type {
  AgentSkillOutcome,
  AgentSkillStatus,
  AgentSkillTarget,
  CliCommandStatus,
  CliLinkOutcome,
  DiagnosticsOutcome,
  SkillFailureReason,
  SkillState,
  SupervisorStatus,
} from "../shared/settings-bridge.ts";
import type { CliLinkResult, CliLinkState } from "./integration/cli-link.ts";
import type { LibraryClient } from "./library-controller.ts";

// 设置页“命令行与智能体”背后的主进程一侧（规格 DESKTOP-SETTINGS-20 至 24、50 至 53）：
// `runyard` 命令接到 PATH、导出诊断信息、智能体技能包、后台管理进程的状态与停止。
// 命令行本身做的事（诊断包、技能包）就让随包的命令行去做，不在这里再写一遍（规格：与 runyard doctor --bundle 相同）。
// 不认识 Electron：系统相关的都经 CliHost 传进来。

export interface CliRunResult {
  code: number;
  stdout: string;
}

export interface CliHost {
  /** 运行随包的命令行（源码运行时是仓库里的）；参数是数组，不经 shell */
  runCli(args: string[]): Promise<CliRunResult>;
  /** 命令行链接；没有（从源码运行，没有随包的启动脚本）是 null */
  link: null | {
    /** 链接所在目录，如 ~/.local/bin */
    binDir: string;
    state(): Promise<CliLinkState>;
    install(): Promise<CliLinkResult>;
    uninstall(): Promise<CliLinkResult>;
  };
  /** 登录 shell 的 PATH；读不到是 null（这时不下“不在 PATH 上”的结论） */
  loginPath(): Promise<string | null>;
  /** 应用（和命令行）的版本 */
  version: string;
  /** 主目录；技能包的位置在它下面 */
  home: string;
  /** 这些路径是不是存在 */
  exists(path: string): Promise<boolean>;
  /** 用户的登录 shell 名（zsh、bash…），决定“加入 PATH”那行命令写进哪个文件 */
  shellName(): string;
  revealInFileManager(path: string): void;
  openSkillGuide?(locale: "en" | "zh-CN"): Promise<string>;
}

const SKILL_FOLDERS: Record<AgentSkillTarget, string> = {
  claude: ".claude/skills/runyard/SKILL.md",
  agents: ".agents/skills/runyard/SKILL.md",
};

function isSkillState(value: unknown): value is SkillState {
  return value === "missing" || value === "current" || value === "outdated";
}

/** 主目录缩成 ~，给界面显示 */
function tilde(path: string, home: string): string {
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** 加入 PATH 的一行命令（只展示和复制，应用不改用户的 shell 配置） */
export function pathCommandFor(binDir: string, home: string, shell: string): string {
  const dir = tilde(binDir, home).replace(/^~/, "$HOME");
  const profile = shell === "bash" ? "~/.bash_profile" : "~/.zshrc";
  return `echo 'export PATH="${dir}:$PATH"' >> ${profile}`;
}

export class CliSettings {
  readonly #client: Pick<LibraryClient, "call">;
  readonly #host: CliHost;

  constructor(client: Pick<LibraryClient, "call">, host: CliHost) {
    this.#client = client;
    this.#host = host;
  }

  async status(): Promise<CliCommandStatus> {
    const { link, version, home } = this.#host;
    const base = { version, onPath: false, pathCommand: "" };
    if (link === null) return { ...base, state: "unavailable" };
    const state = await link.state();
    const path = tilde(state.link, home);
    const pathCommand = pathCommandFor(link.binDir, home, this.#host.shellName());
    if (state.status === "absent") return { ...base, state: "missing", pathCommand };
    if (state.status === "conflict") return { ...base, state: "conflict", path, pathCommand };
    const search = await this.#host.loginPath();
    // 读不到登录环境时不吓用户：当作在 PATH 上
    const onPath = search === null || search.split(":").includes(link.binDir);
    return {
      ...base,
      state: state.status === "current" ? "installed" : "stale",
      path,
      onPath,
      pathCommand,
    };
  }

  async install(): Promise<CliLinkOutcome> {
    return await this.#change((link) => link.install());
  }

  async remove(): Promise<CliLinkOutcome> {
    return await this.#change((link) => link.uninstall());
  }

  async #change(
    act: (link: NonNullable<CliHost["link"]>) => Promise<CliLinkResult>,
  ): Promise<CliLinkOutcome> {
    const { link } = this.#host;
    if (link === null) return { result: "failed", status: await this.status() };
    try {
      const done = await act(link);
      return {
        result: done.status === "conflict" ? "conflict" : "done",
        status: await this.status(),
      };
    } catch {
      return { result: "failed", status: await this.status() };
    }
  }

  /** “导出诊断信息…”：就是 runyard doctor --bundle，完成后在访达里选中生成的文件（规格 DESKTOP-SETTINGS-22） */
  async exportDiagnostics(): Promise<DiagnosticsOutcome> {
    try {
      const run = await this.#host.runCli(["doctor", "--bundle", "--json"]);
      const bundle = (JSON.parse(run.stdout) as { bundle?: unknown }).bundle;
      if (run.code !== 0 || typeof bundle !== "string") return { ok: false };
      this.#host.revealInFileManager(bundle);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async openSkillGuide(locale: unknown): Promise<{ ok: boolean; content?: string }> {
    if (locale !== "en" && locale !== "zh-CN") return { ok: false };
    try {
      const content = await this.#host.openSkillGuide?.(locale);
      return content ? { ok: true, content } : { ok: false };
    } catch {
      return { ok: false };
    }
  }

  /** 每个位置里的技能包：没装、当前版本还是旧版，由命令行比内容得出（runyard skill status，规格 CLI-COMMANDS-93） */
  async agentSkills(): Promise<AgentSkillStatus> {
    const status: AgentSkillStatus = { claude: "missing", agents: "missing" };
    try {
      const run = await this.#host.runCli(["skill", "status", "--json"]);
      const targets = (
        JSON.parse(run.stdout) as { targets?: { target?: unknown; state?: unknown }[] }
      ).targets;
      for (const item of run.code === 0 && Array.isArray(targets) ? targets : []) {
        const state = item.state;
        if ((item.target === "claude" || item.target === "agents") && isSkillState(state))
          status[item.target] = state;
      }
    } catch {
      // 读不到就当没装：不在这里吓用户，界面上点安装会得到具体原因
    }
    return status;
  }

  /** 安装或更新一类智能体：就是 runyard skill install --target（规格 DESKTOP-SETTINGS-24、51） */
  async installAgentSkill(target: AgentSkillTarget): Promise<AgentSkillOutcome> {
    return await this.#changeSkill(["skill", "install", "--target", target, "--json"], target);
  }

  /** 移除：runyard skill uninstall --target，只移走 runyard 装的目录，有别人的文件就保留（规格 DESKTOP-SETTINGS-52） */
  async removeAgentSkill(target: AgentSkillTarget): Promise<AgentSkillOutcome> {
    return await this.#changeSkill(["skill", "uninstall", "--target", target, "--json"], target);
  }

  /** 在访达中显示已装的技能说明；没装就什么都不做 */
  async revealAgentSkill(target: AgentSkillTarget): Promise<void> {
    const file = `${this.#host.home}/${SKILL_FOLDERS[target]}`;
    if (await this.#host.exists(file)) this.#host.revealInFileManager(file);
  }

  async #changeSkill(args: string[], target: AgentSkillTarget): Promise<AgentSkillOutcome> {
    let failure: SkillFailureReason | undefined;
    try {
      const run = await this.#host.runCli(args);
      const body = JSON.parse(run.stdout) as {
        error?: { code?: unknown };
        skipped?: unknown[];
      };
      if (run.code !== 0) failure = body.error?.code === "PATH_LOCKED" ? "permission" : "other";
      else if ((body.skipped?.length ?? 0) > 0) failure = "foreign-files";
    } catch {
      failure = "other";
    }
    const status = await this.agentSkills();
    return failure === undefined ? { status } : { status, failure: { target, reason: failure } };
  }

  async supervisorStatus(): Promise<SupervisorStatus> {
    try {
      await this.#client.call("supervisor.info", {});
      const runs = await this.#client.call("run.list", { running: true });
      const held = (kind: "cli" | "tab") => runs.filter((run) => run.owner.kind === kind).length;
      return { running: true, cliRuns: held("cli"), tabRuns: held("tab") };
    } catch {
      return { running: false, cliRuns: 0, tabRuns: 0 };
    }
  }

  /** 停止命令行持有的运行，再让管理进程退出（界面已经确认过）；应用之后需要时会再拉起新的 */
  async stopSupervisor(): Promise<SupervisorStatus> {
    try {
      await this.#client.call("run.stopAll", { mine: true });
      await this.#client.call("supervisor.shutdown", { ifIdle: false, reason: "user" });
    } catch {
      return await this.supervisorStatus();
    }
    return { running: false, cliRuns: 0, tabRuns: 0 };
  }
}
