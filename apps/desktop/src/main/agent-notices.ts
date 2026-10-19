import { randomUUID } from "node:crypto";
import type { Playground, RunSnapshot } from "@runyard/protocol";
import { agentDisplayName } from "../shared/agent-name.ts";
import type { AppNotice, LinkNoticeCode } from "../shared/library-state.ts";
import { isActiveRun } from "./build-library-state.ts";

// 右下角的提示（规格 DESKTOP-LIBRARY-VIEW-54 至 56）：智能体经命令行创建并运行了项目时给一条。
// 管理进程的 agent.activity 事件还只占着名字（协议登记为“以后”），所以这里从项目和运行的变化里推：
// 命令行持有的、仍在进行的运行，所属项目由智能体或命令行创建，且创建后不久就开始运行。
// 只创建不运行的没有这样的运行，自然不提示；应用开着之前就在跑的也不提示。

/** 创建到开始运行之间的最长间隔：`runyard new --run` 是一步完成的，之后才被命令行跑起来的不算“创建并运行” */
export const CREATE_RUN_WINDOW_MS = 60_000;

export class AgentNotices {
  readonly #seen = new Set<string>();
  readonly #list: AppNotice[] = [];
  #baselined = false;
  #counter = 0;
  readonly #session = randomUUID();

  /** 每次重读后调用；第一次只记下已有的运行，不提示 */
  observe(playgrounds: readonly Playground[], runs: readonly RunSnapshot[], now: number): void {
    const byId = new Map(playgrounds.map((playground) => [playground.id, playground]));
    for (const run of runs) {
      if (this.#seen.has(run.runId)) continue;
      this.#seen.add(run.runId);
      if (!this.#baselined) continue;
      const playground = byId.get(run.playgroundId);
      if (playground === undefined || !isAgentRun(playground, run)) continue;
      this.#list.push({
        kind: "agent-run",
        id: `agent-${run.runId}`,
        playgroundId: playground.id,
        name: playground.name,
        agent: agentOf(playground, run),
        url: urlOf(run),
        at: now,
      });
    }
    this.#baselined = true;
    // 运行已经结束或项目没了：提示里的“停止”没有对象了，随之撤掉
    const active = new Map(
      runs.filter((run) => isActiveRun(run.state)).map((run) => [run.playgroundId, run]),
    );
    for (let index = this.#list.length - 1; index >= 0; index -= 1) {
      const notice = this.#list[index];
      if (notice?.kind !== "agent-run") continue;
      const run = active.get(notice.playgroundId);
      if (run === undefined) this.#list.splice(index, 1);
      // 创建时端口还没分到的，之后补上地址
      else if (notice.url === null) this.#list[index] = { ...notice, url: urlOf(run) };
    }
  }

  /** 创建成功带回的路径提示（接近长度上限） */
  addPathNearLimit(name: string, length: number, limit: number): void {
    this.#counter += 1;
    this.#list.push({
      kind: "path-near-limit",
      id: `path-${this.#session}-${this.#counter}`,
      name,
      length,
      limit,
    });
  }

  /** 链接没能照做的提示（规格 DESKTOP-LINKS-03、04、10、11、14、16）；同一类同一个值的提示不叠加 */
  addLink(code: LinkNoticeCode, value: string | null): void {
    if (this.#list.some((n) => n.kind === "link" && n.code === code && n.value === value)) return;
    this.#counter += 1;
    this.#list.push({ kind: "link", id: `link-${this.#session}-${this.#counter}`, code, value });
  }

  dismiss(id: string): void {
    const index = this.#list.findIndex((notice) => notice.id === id);
    if (index >= 0) this.#list.splice(index, 1);
  }

  list(): AppNotice[] {
    return [...this.#list];
  }
}

function urlOf(run: RunSnapshot): string | null {
  return run.port === undefined ? null : `http://127.0.0.1:${run.port}/`;
}

function agentOf(playground: Playground, run: RunSnapshot): string | null {
  const raw =
    playground.createdBy.agent ?? (run.owner.kind === "cli" ? run.owner.agent : undefined);
  return raw === undefined ? null : agentDisplayName(raw);
}

function isAgentRun(playground: Playground, run: RunSnapshot): boolean {
  if (run.owner.kind !== "cli" || !isActiveRun(run.state)) return false;
  // 命令行用户（没有智能体名字）自己建的项目不是智能体创建的，不提示（#418）
  const { kind, agent } = playground.createdBy;
  if (kind === "user" || (kind === "cli" && agent === undefined)) return false;
  return run.startedAt - playground.createdAt <= CREATE_RUN_WINDOW_MS;
}
