import type { FailureReason, RunyardError } from "@runyard/protocol";
import { installDependencies, installIsCurrent } from "./install-dependencies.ts";
import type { PrepareStep, StepFailure } from "./prepare-step.ts";
import { resolveExecutable } from "./resolve-executable.ts";

// 准备的第二步：选包管理器、必要时安装依赖（规格 RUN-LIFECYCLE-06、07）。
// 没有 setup 的运行器什么也不做。

function pickVariant(step: PrepareStep): string | undefined {
  const { subject, checked } = step;
  const variants = Object.keys(subject.runner.setup?.variants ?? {});
  const available = (tool: string) =>
    checked.tools.some((entry) => entry.tool === tool && entry.status === "found");
  const order = [...(subject.packageManager ? [subject.packageManager] : []), ...variants];
  return order.find((tool) => variants.includes(tool) && available(tool));
}

function failed(
  step: PrepareStep,
  outcome: Extract<Awaited<ReturnType<typeof installDependencies>>, { status: "failed" }>,
  variant: string,
): RunyardError<FailureReason> {
  const name = step.context.request.name;
  const cause = {
    ...(outcome.exitCode === null ? {} : { exitCode: outcome.exitCode }),
    outputTail: outcome.outputTail,
  };
  if (outcome.reason === "RUNTIME_MISSING") {
    return {
      code: "RUNTIME_MISSING",
      params: { tool: variant },
      debug: "install output matched a missing-runtime pattern",
      cause,
    };
  }
  const offline = outcome.reason === "DEPS_OFFLINE";
  return {
    code: outcome.reason,
    params: { name },
    debug: offline ? "install failed offline with uncached packages" : "install command failed",
    cause,
  };
}

export async function runInstallStep(step: PrepareStep): Promise<StepFailure | undefined> {
  const { deps, context, subject } = step;
  const setup = subject.runner.setup;
  if (setup === undefined) return undefined;

  const variant = pickVariant(step);
  if (variant === undefined) {
    const tool = Object.keys(setup.variants)[0] ?? "";
    return {
      failure: {
        code: "TOOL_MISSING",
        params: { tool, required: subject.requires[tool]?.version ?? "*" },
        debug: "no package manager from the runner's variants is available",
      },
    };
  }
  const wanted = subject.packageManager;
  const noted = step.checked.notices.some((n) => n.code === "PACKAGE_MANAGER_FALLBACK");
  if (wanted !== undefined && wanted !== variant && !noted) {
    step.log({ code: "PACKAGE_MANAGER_FALLBACK", params: { wanted, used: variant } });
  }

  const env = step.envFor();
  const argv = await resolveExecutable(
    deps.platform,
    [...(setup.variants[variant]?.command ?? [])],
    step.checked,
    subject.folder,
    env,
  );
  if (!(await installIsCurrent(deps.platform, subject.folder, setup, variant))) {
    context.report("installing");
  }
  const outcome = await installDependencies({
    platform: deps.platform,
    clock: deps.clock,
    setup,
    folder: subject.folder,
    variant,
    argv,
    env,
    signal: context.signal,
    onEntry: context.log,
  });
  if (outcome.status === "failed") return { failure: failed(step, outcome, variant) };
  if (outcome.status === "aborted") {
    return {
      failure: {
        code: "SETUP_FAILED",
        params: { name: context.request.name },
        debug: "install aborted",
      },
    };
  }
  return undefined;
}
