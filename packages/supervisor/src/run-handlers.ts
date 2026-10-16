import { isActiveState, type Run } from "@runyard/core";
import type { Owner, RunSnapshot } from "@runyard/protocol";
import type { HandlerMap } from "./dispatch.ts";
import { methodFailure } from "./method-failure.ts";
import type { RunControl } from "./run-control.ts";
import type { OwnerBindings } from "./run-owners.ts";
import type { Session } from "./session.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// run.* 方法的登记。参数已按登记表校验。`run.disown` 在登记表里是 reserved，管理进程回 NOT_SUPPORTED。

/** 谁在“查看”哪个运行。只是记账：不改持有者，不算空闲活动（规格 RUN-OWNERSHIP-17） */
export class RunViewers {
  readonly #viewers = new Map<string, Set<string>>();

  attach(runId: string, clientId: string): void {
    const set = this.#viewers.get(runId) ?? new Set<string>();
    set.add(clientId);
    this.#viewers.set(runId, set);
  }

  detach(runId: string, clientId: string): void {
    this.#viewers.get(runId)?.delete(clientId);
  }

  of(runId: string): readonly string[] {
    return [...(this.#viewers.get(runId) ?? [])];
  }
}

export interface RunHandlerDeps {
  readonly api: SupervisorApi;
  readonly control: RunControl;
  readonly owners: OwnerBindings;
  readonly viewers: RunViewers;
  readonly mentioned: (run: Run, session: Session | undefined) => void;
}

export function createRunHandlers(deps: RunHandlerDeps): HandlerMap {
  const { api, control, owners, viewers } = deps;
  const { engine } = control;

  return {
    "run.start": (params, { session }) =>
      control.start({
        ref: params.playground,
        owner: params.owner,
        port: params.port,
        wait: params.wait,
        timeoutMs: params.timeoutMs,
        session,
      }),
    "run.stop": (params, { session }) => control.stop(params, session),
    "run.stopAll": async ({ mine }) => {
      const stopped = await engine.stopAll(mine === undefined ? {} : { mine });
      return { stopped: stopped.map((snapshot) => snapshot.runId) };
    },
    "run.restart": ({ playground }, { session }) => control.restart(playground, session),
    "run.get": ({ runId }, { session }) => {
      const run = control.get(runId);
      deps.mentioned(run, session);
      return run.snapshot();
    },
    "run.list": ({ running }) =>
      engine
        .list()
        .filter((run) => running !== true || isActiveState(run.state))
        .map((run) => run.snapshot()),
    "run.adopt": ({ runId, owner }, { session }) => {
      const run = control.get(runId);
      if (!isActiveState(run.state)) return run.snapshot();
      adopt(run, owner, session);
      return run.snapshot();
    },
    "run.attach": ({ runId, clientId }, { session }) => {
      control.get(runId);
      owners.reconnect(clientId, session);
      viewers.attach(runId, clientId);
      return {};
    },
    "run.detach": ({ runId, clientId }, { session }) => {
      control.get(runId);
      owners.reconnect(clientId, session);
      viewers.detach(runId, clientId);
      return {};
    },
    "run.stdin": async ({ runId, data }, { session }) => {
      const run = control.get(runId);
      deps.mentioned(run, session);
      const outcome = await run.writeStdin(data);
      if (outcome === "closed") throw methodFailure("RUN_NOT_FOUND", { runId }, "run has ended");
      if (outcome === "unsupported") {
        throw methodFailure("NOT_SUPPORTED", {}, "this run does not take standard input");
      }
      return {};
    },
  };

  // 持有者换成标签页：绑定到这条连接，并告诉订阅者（状态没变，快照里的 owner 变了）
  function adopt(run: Run, owner: Extract<Owner, { kind: "tab" }>, session: Session): void {
    run.setOwner(owner);
    owners.bind(owner.clientId, session);
    const snapshot: RunSnapshot = run.snapshot();
    api.publish("run.state", {
      run: snapshot,
      previous: run.state,
      at: api.clock.now(),
      runningCount: engine.runningCount(),
    });
  }
}
