import type { FailureReason, Owner, RunSnapshot, RunState } from "@runyard/protocol";
import type { RunPlan, StartRequest } from "./run-types.ts";

// 一次运行此刻的快照。可选字段没有值时整个不出现（协议的快照里没有 undefined）。

export type SnapshotFields = {
  readonly runId: string;
  readonly request: StartRequest;
  readonly state: RunState;
  readonly owner: Owner;
  readonly reason?: FailureReason | undefined;
  readonly stale: boolean;
  readonly slow: boolean;
  readonly plan?: RunPlan | undefined;
  readonly pid?: number | undefined;
  readonly exitCode?: number | undefined;
  readonly startedAt: number;
  readonly readyMs?: number | undefined;
  readonly endedAt?: number | undefined;
  readonly logCount: number;
  readonly idleStopAt?: number | undefined;
};

export function buildSnapshot(f: SnapshotFields): RunSnapshot {
  const { plan } = f;
  return {
    runId: f.runId,
    playgroundId: f.request.playgroundId,
    name: f.request.name,
    kind: f.request.kind,
    state: f.state,
    ...(f.reason === undefined ? {} : { reason: f.reason }),
    ...(f.stale ? { stale: true } : {}),
    owner: f.owner,
    ...(f.slow ? { slow: true } : {}),
    ...(plan?.port === undefined ? {} : { port: plan.port }),
    ...(plan?.url === undefined ? {} : { url: plan.url }),
    ...(plan?.portFallback === undefined ? {} : { portFallback: plan.portFallback }),
    ...(f.pid === undefined ? {} : { pid: f.pid }),
    ...(f.exitCode === undefined ? {} : { exitCode: f.exitCode }),
    startedAt: f.startedAt,
    ...(f.readyMs === undefined ? {} : { readyMs: f.readyMs }),
    ...(f.endedAt === undefined ? {} : { durationMs: f.endedAt - f.startedAt }),
    ...(f.idleStopAt === undefined ? {} : { idleStopAt: f.idleStopAt }),
    cursor: `${f.runId}:${f.logCount}`,
  };
}
