import { type AbsPath, absPath } from "@runyard/platform";
import type { LogEntry, Owner, RunSnapshot } from "@runyard/protocol";
import { createFakePlatform, type ProcessBehavior } from "@runyard/testing";
import { expect, it } from "vitest";
import { RunEngine } from "./run-engine.ts";
import type {
  PrepareContext,
  PrepareOutcome,
  ReadinessProbe,
  RunExitEvent,
  RunPlan,
  RunStateEvent,
  StartRequest,
} from "./run-types.ts";

// 运行引擎测试共用的现场：假平台、假时钟、记录事件的出口、可替换的准备阶段。
// 放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing（testing-imports 检查）。

export const dir = absPath("/fake/project");
export const tabOwner: Owner = { kind: "tab", clientId: "c1", tabId: "t1" };
export const cliOwner: Owner = { kind: "cli", command: "run" };
export const serverArgv = ["node", "server.js"];
export const scriptArgv = ["node", "script.js"];

export type HarnessOptions = {
  plan?: Partial<RunPlan>;
  prepare?: (context: PrepareContext, plan: RunPlan) => Promise<PrepareOutcome>;
};

export function createHarness(options: HarnessOptions = {}) {
  const fake = createFakePlatform();
  const { platform, clock } = fake;
  const states: RunStateEvent[] = [];
  const logs: { runId: string; entry: LogEntry }[] = [];
  const exits: RunExitEvent[] = [];
  const slows: RunSnapshot[] = [];
  const removed: AbsPath[] = [];

  // 就绪探测：每 100 毫秒看一次计划里的端口，被占用就是就绪（和 #36 的 port 探测同样的做法）
  const readiness: ReadinessProbe = {
    waitReady({ plan, signal }) {
      return new Promise((resolve) => {
        const timer = clock.setTimeout(function poll() {
          if (signal.aborted || plan.port === undefined) return;
          void platform.ports.isFree(plan.port).then((status) => {
            if (status === "in-use") resolve();
            else clock.setTimeout(poll, 100);
          });
        }, 100);
        signal.addEventListener("abort", () => clock.clearTimeout(timer));
      });
    },
  };

  // 服务默认监听 7100；脚本是 scriptArgv、没有端口。options.plan 覆盖服务的计划
  const planFor = (request: StartRequest): RunPlan => ({
    argv: request.kind === "oneshot" ? scriptArgv : serverArgv,
    cwd: dir,
    env: {},
    stdin: false,
    stop: { mode: "graceful", graceMs: 2000 },
    ...(request.kind === "oneshot" ? {} : { port: 7100 }),
    ...(request.kind === "oneshot" ? {} : options.plan),
  });

  const engine = new RunEngine({
    platform,
    clock,
    readiness,
    sinks: {
      state: (event) => states.push(event),
      log: (runId, entry) => logs.push({ runId, entry }),
      exit: (event) => exits.push(event),
      slow: (snapshot) => slows.push(snapshot),
    },
    preparer: {
      prepare: (context) =>
        options.prepare?.(context, planFor(context.request)) ??
        Promise.resolve({ ok: true, plan: planFor(context.request) }),
    },
    removeDir: async (target) => {
      removed.push(target);
      fake.fs.remove(target);
    },
  });

  const request = (overrides: Partial<StartRequest> = {}): StartRequest => ({
    playgroundId: "pg-1",
    name: "demo",
    kind: "server",
    owner: tabOwner,
    ...overrides,
  });

  /** 让准备阶段的异步工作跑完，不推进假时间 */
  const settle = () => clock.advance(0);
  const script = (behavior: ProcessBehavior, argv: readonly string[] = serverArgv) =>
    fake.processes.when(argv, behavior);

  return { fake, engine, states, logs, exits, slows, removed, request, settle, script };
}

it("现场：启动请求把计划里的参数原样交给平台，并带运行标记", async () => {
  const h = createHarness();
  h.engine.start(h.request());
  await h.settle();
  const spawned = h.fake.processes.spawned[0];
  expect(spawned?.argv).toEqual(serverArgv);
  expect(spawned?.env.RUNYARD_RUN_ID).toBe("run-1");
});
