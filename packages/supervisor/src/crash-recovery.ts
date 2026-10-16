import {
  type CrashedRunInput,
  DEFAULT_GRACE_MS,
  RUN_MARKER_VAR,
  type RunSpawnedEvent,
  stopProcessTree,
} from "@runyard/core";
import { absPath } from "@runyard/platform";
import { RUN_RECORD_VERSION, type RunRecord } from "@runyard/protocol";
import type { RunObserver } from "./run-module.ts";
import { createRunRecordStore, type RunRecordStore } from "./run-record-store.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 崩溃后清理（#42，规格 SUPERVISOR-LIFECYCLE-16、17；技术设计 §2.4）。
// 运行期间：进程起来时写运行记录，运行结束时删。管理进程自己崩了，子进程不会跟着走（决策记录 0006），
// 记录就留着；下次启动时逐个核对 pid 加启动时间，两者都对得上的整棵结束，对不上的（pid 被复用）绝不碰。
// 每一条记录都留一个 `crashed` 的运行在引擎里，让 run.get 和状态说得出它的结局；不重新接管。

export interface CrashRecoveryDeps {
  /** 在引擎里登记 crashed 的运行（`RunEngine.restoreCrashed`） */
  readonly restore: (input: CrashedRunInput) => void;
  /** 项目名（找不到就用 id）；失败不挡着清理 */
  readonly nameOf: (playgroundId: string) => Promise<string | undefined>;
  /** 给开发者看的英文诊断行 */
  readonly log: (line: string) => void;
  readonly store?: RunRecordStore;
}

export interface CrashRecovery {
  /** 接到 `RunObserver`：写和删运行记录 */
  readonly observer: Required<Pick<RunObserver, "spawned" | "exit">>;
  /** 给 `SupervisorExtensions.recoverCrashedRuns` */
  recover(): Promise<void>;
  /** 等记录的写和删都落盘（关闭管理进程时用） */
  flush(): Promise<void>;
}

export function createCrashRecovery(api: SupervisorApi, deps: CrashRecoveryDeps): CrashRecovery {
  const { platform, clock } = api;
  const store = deps.store ?? createRunRecordStore({ platform, now: () => clock.now() });
  // 同一个运行的写和删排成一条：进程刚起来就退出时，删不能先于写
  const chains = new Map<string, Promise<void>>();
  const enqueue = (runId: string, task: () => Promise<void>) => {
    const next = (chains.get(runId) ?? Promise.resolve())
      .then(task)
      .catch((error: unknown) => deps.log(`run record ${runId}: ${String(error)}`));
    chains.set(runId, next);
    return next;
  };

  const recordOf = (event: RunSpawnedEvent): RunRecord => ({
    formatVersion: RUN_RECORD_VERSION,
    runId: event.runId,
    playgroundId: event.request.playgroundId,
    owner: event.owner,
    pid: event.ref.pid,
    processStart: event.ref.startTime,
    cwd: event.plan.cwd,
    ...(event.plan.port === undefined ? {} : { port: event.plan.port }),
    command: [...event.plan.argv],
    startedAt: event.startedAt,
    state: event.state,
    marker: event.runId,
  });

  async function recoverOne(record: RunRecord): Promise<string> {
    const identity = await platform.proc.identity(record.pid);
    const sameProcess = identity !== null && identity.startTime === record.processStart;
    if (sameProcess) {
      await stopProcessTree(
        platform,
        clock,
        { pid: record.pid, startTime: record.processStart },
        { mode: "graceful", graceMs: DEFAULT_GRACE_MS },
        record.port,
        { name: RUN_MARKER_VAR, value: record.runId },
      );
    }
    const name =
      (await deps.nameOf(record.playgroundId).catch(() => undefined)) ?? record.playgroundId;
    deps.restore({
      runId: record.runId,
      request: {
        playgroundId: record.playgroundId,
        name,
        kind: record.port === undefined ? "oneshot" : "server",
        owner: record.owner,
      },
      plan: {
        argv: record.command,
        cwd: absPath(record.cwd),
        env: {},
        stdin: false,
        stop: { mode: "graceful", graceMs: DEFAULT_GRACE_MS },
        ...(record.port === undefined
          ? {}
          : { port: record.port, url: `http://127.0.0.1:${record.port}` }),
      },
      pid: record.pid,
      startedAt: record.startedAt,
      endedAt: clock.now(),
    });
    await store.remove(record.runId);
    return sameProcess ? "process tree ended" : "process gone or pid reused, nothing ended";
  }

  return {
    observer: {
      spawned: (event) => void enqueue(event.runId, () => store.write(recordOf(event))),
      exit: (event) => void enqueue(event.runId, () => store.remove(event.runId)),
    },
    async recover() {
      for (const read of await store.readAll()) {
        if (read.status === "ok") {
          const outcome = await recoverOne(read.record);
          deps.log(`run ${read.record.runId} crashed with the previous supervisor: ${outcome}`);
        } else if (read.status === "newer") {
          deps.log(`run record ${read.file} was written by a newer version, left untouched`);
        } else {
          deps.log(`run record ${read.file} is unreadable, kept as ${read.quarantinedAs}`);
        }
      }
    },
    flush: async () => {
      await Promise.all(chains.values());
    },
  };
}
