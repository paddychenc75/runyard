import { DAY_MS, dueAt, isActiveState } from "@runyard/core";
import type { Playground, RunSnapshot } from "@runyard/protocol";
import { cliError } from "../cli-error.ts";
import type { CommandContext } from "./command-context.ts";
import type { CommandHandler } from "./command-spec.ts";

// status [pg] [--running]（规格 CLI-COMMANDS“status 列出项目和运行状态”；PRD #prd-run-view）。
// 键固定，不适用的值是 null。url、port、owner 等只对活动中的运行有意义，运行结束后是 null。
// 项目列表来自 playground.list（找不到文件夹的项目也在里面，missing 为 true，不让命令失败）。

function latestRuns(runs: readonly RunSnapshot[]): Map<string, RunSnapshot> {
  const latest = new Map<string, RunSnapshot>();
  for (const run of runs) {
    const current = latest.get(run.playgroundId);
    // 同一个项目同时只有一个活动运行；其余按开始时间取最新
    const newer =
      current === undefined ||
      (isActiveState(run.state) && !isActiveState(current.state)) ||
      (isActiveState(run.state) === isActiveState(current.state) &&
        run.startedAt > current.startedAt);
    if (newer) latest.set(run.playgroundId, run);
  }
  return latest;
}

/** 距离到期的整天数（向上取整，刚创建的 30 天项目是 30）；没开自动清理是 null */
function cleanInDays(playground: Playground, now: number): number | null {
  const due = dueAt(playground);
  return due === null ? null : Math.max(0, Math.ceil((due - now) / DAY_MS));
}

function row(playground: Playground, run: RunSnapshot | undefined, now: number) {
  const active = run !== undefined && isActiveState(run.state);
  const owner = active ? run.owner : undefined;
  return {
    id: playground.id,
    name: playground.name,
    path: playground.path,
    template: playground.template.id,
    kind: playground.kind,
    state: run?.state ?? "stopped",
    url: active ? (run.url ?? null) : null,
    port: active ? (run.port ?? null) : null,
    owner: owner?.kind ?? null,
    agent: owner?.kind === "cli" ? (owner.agent ?? null) : null,
    idleStopAt: active ? (run.idleStopAt ?? null) : null,
    retention: playground.autoClean.enabled ? "autoClean" : "kept",
    cleanInDays: cleanInDays(playground, now),
    note: playground.note ?? null,
    createdBy: playground.createdBy,
    lastUsedAt: playground.lastUsedAt,
    missing: playground.missingSince !== undefined,
  };
}

function humanLine(context: CommandContext, item: ReturnType<typeof row>) {
  return context.t("cli.status.item.body", {
    name: item.name,
    state: context.t(`runState.${item.state}`),
    url: item.url ?? "none",
    missing: item.missing ? "yes" : "no",
  });
}

export const status: CommandHandler = async (context) => {
  const ref = context.positionals[0];
  const client = await context.client();
  const [playgrounds, runs] = await Promise.all([
    client.call("playground.list", {}),
    client.call("run.list", {}),
  ]);
  const latest = latestRuns(runs);
  const now = context.host.clock.now();

  let chosen = playgrounds;
  if (ref !== undefined) {
    chosen = playgrounds.filter((p) => p.name === ref || p.id === ref || p.path === ref);
    if (chosen.length === 0) throw cliError("PLAYGROUND_NOT_FOUND", { name: ref });
  }
  let rows = chosen.map((p) => row(p, latest.get(p.id), now));
  if (context.flag("running")) {
    rows = rows.filter((item) => item.owner !== null);
  }
  const running = runs.filter((run) => isActiveState(run.state)).length;
  context.out.result({ running, playgrounds: rows }, [
    context.t("cli.status.summary.body", { count: running }),
    ...(rows.length === 0
      ? [context.t("cli.status.empty.body")]
      : rows.map((item) => humanLine(context, item))),
  ]);
};
