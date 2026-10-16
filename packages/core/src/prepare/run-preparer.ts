import type { FailureReason, Notice, RunyardError } from "@runyard/protocol";
import type { RunClock } from "../run/run-clock.ts";
import { buildRunEnv } from "../run/run-env.ts";
import type {
  PrepareContext,
  PrepareOutcome,
  RunPreparer,
  StartRequest,
} from "../run/run-types.ts";
import {
  detectInstallContext,
  type InstallHint,
  selectInstallHint,
} from "../toolchain/install-hint.ts";
import { runInstallStep } from "./prepare-install.ts";
import { buildPlan, runPortStep } from "./prepare-plan.ts";
import { isFailure, type PrepareStep, type RunPreparerDeps } from "./prepare-step.ts";

// 启动前的准备，即 checking 与 installing 两个阶段（规格 RUN-LIFECYCLE-04 到 07、RUN-PORTS-05 到 09、
// TOOLCHAIN-DETECTION-03）：工具检查 → 依赖安装 → 端口 → 环境 → 启动计划。
// 缺工具不安装任何东西，只报错；安装提示另给（installHintFor），且只展示不执行。

export type { RunPreparerDeps } from "./prepare-step.ts";

export type RunPreparerHandle = RunPreparer & {
  /** 失败后给用户的安装提示：只产出数据，不执行任何命令 */
  installHintFor(
    request: StartRequest,
    failure: RunyardError<FailureReason>,
  ): Promise<InstallHint | undefined>;
};

const system = (clock: RunClock, notice: Notice) =>
  ({ at: clock.now(), kind: "system", notice }) as const;

export function createRunPreparer(deps: RunPreparerDeps): RunPreparerHandle {
  const { platform, clock } = deps;

  async function prepare(context: PrepareContext): Promise<PrepareOutcome> {
    const subject = await deps.resolve(context.request);
    const log = (notice: Notice) => context.log(system(clock, notice));

    // 1. 工具检查：不通过就不往下走
    const checked = await deps.toolchain.check({ requires: subject.requires, cwd: subject.folder });
    for (const notice of checked.notices) log(notice);
    const missing = checked.errors[0];
    if (missing !== undefined) return { ok: false, failure: missing };

    const loaded = await platform.env.load({ cwd: subject.folder });
    const network = deps.network?.();
    const step: PrepareStep = {
      deps,
      context,
      subject,
      checked,
      log,
      envFor: (port) => ({
        ...buildRunEnv({
          base: loaded.env,
          runDefaults: platform.env.runDefaults(),
          ...(subject.runner.run?.env === undefined ? {} : { runnerEnv: subject.runner.run.env }),
          ...(port === undefined ? {} : { port }),
          ...(network === undefined ? {} : { network }),
        }),
      }),
    };

    const installFailure = await runInstallStep(step);
    if (installFailure !== undefined) return { ok: false, ...installFailure };
    const chosen = await runPortStep(step);
    if (chosen !== undefined && isFailure(chosen)) return { ok: false, ...chosen };
    const plan = await buildPlan(step, chosen);
    return isFailure(plan) ? { ok: false, ...plan } : { ok: true, plan };
  }

  async function installHintFor(
    request: StartRequest,
    failure: RunyardError<FailureReason>,
  ): Promise<InstallHint | undefined> {
    if (failure.code !== "TOOL_MISSING" && failure.code !== "TOOL_TOO_OLD") return undefined;
    const subject = await deps.resolve(request);
    const loaded = await platform.env.load({ cwd: subject.folder });
    const context = await detectInstallContext(platform, loaded.env, deps.definitions.values());
    const tool = failure.params.tool;
    const requirement = subject.requires[tool];
    const definition = deps.definitions.get(tool);
    return selectInstallHint({
      tool,
      context,
      ...(definition === undefined ? {} : { definition }),
      ...(requirement === undefined ? {} : { requirement }),
    });
  }

  return { prepare, installHintFor };
}
