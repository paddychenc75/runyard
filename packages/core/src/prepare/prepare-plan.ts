import { type AbsPath, joinPath, posixRelPath } from "@runyard/platform";
import type { ErrorCause, FailureReason, RunyardError } from "@runyard/protocol";
import { chooseRunPort } from "../ports/choose-run-port.ts";
import { DEFAULT_PORT_RANGE } from "../ports/port-range.ts";
import { expandCommand } from "../run/expand-command.ts";
import type { RunPlan } from "../run/run-types.ts";
import type { PrepareStep, StepFailure } from "./prepare-step.ts";
import { resolveExecutable } from "./resolve-executable.ts";

// 准备的最后两步：端口、启动计划（规格 RUN-PORTS-05 到 09、RUN-LIFECYCLE-19）。

type Port = { port: number; portFallback?: NonNullable<RunPlan["portFallback"]> };

/** 脚本没有端口；服务和页面先试登记的（或命令行给的）端口，被占用才回退，回退只用于这一次 */
export async function runPortStep(step: PrepareStep): Promise<Port | undefined | StepFailure> {
  const { deps, subject, context } = step;
  if (context.request.kind === "oneshot") return undefined;
  const range = deps.portRange?.() ?? DEFAULT_PORT_RANGE;
  const wanted = context.request.port ?? subject.registeredPort ?? range.min;
  const chosen = await chooseRunPort({
    platform: deps.platform,
    wanted,
    range,
    registeredByOthers: subject.otherRegisteredPorts,
  });
  if (chosen === null) {
    return {
      failure: {
        code: "RUN_FAILED",
        params: { name: context.request.name },
        debug: `no free port in ${range.min}-${range.max}`,
      },
    };
  }
  const { portFallback } = chosen;
  if (portFallback !== undefined) {
    step.log({
      code: "PORT_FALLBACK",
      params: { wanted: portFallback.wanted, actual: chosen.port, reason: portFallback.reason },
    });
  }
  return chosen;
}

// 就绪之前进程退出时，输出匹配运行器登记的“缺运行库”特征就归为 RUNTIME_MISSING（runner-format.md 第 1 节）
function startupFailure(step: PrepareStep): RunPlan["startupFailure"] {
  const { runner } = step.subject;
  const patterns = (runner.setup?.errors ?? []).filter((e) => e.reason === "RUNTIME_MISSING");
  if (patterns.length === 0) return undefined;
  const tool = runner.needs.find((need): need is string => typeof need === "string") ?? "node";
  return (cause: ErrorCause): RunyardError<FailureReason> | undefined =>
    patterns.some((e) => new RegExp(e.match).test(cause.outputTail ?? ""))
      ? {
          code: "RUNTIME_MISSING",
          params: { tool },
          debug: "start-up output matched a missing-runtime pattern",
          cause,
        }
      : undefined;
}

export async function buildPlan(
  step: PrepareStep,
  chosen: Port | undefined,
): Promise<RunPlan | StepFailure> {
  const { deps, subject, context } = step;
  const { request } = context;
  const { runner, folder } = subject;
  const port = chosen?.port;
  const env = step.envFor(port);

  let tempDir: AbsPath | undefined;
  if (runner.needs.includes("go")) {
    // Go 的 interrupt 停止仍可能留下 go-build 目录：每次运行单独的临时目录，停止后删掉
    tempDir = joinPath(
      deps.platform.paths.stateDir,
      posixRelPath("tmp"),
      posixRelPath(context.runId),
    );
    await deps.platform.fs.makeDir(tempDir);
    env.GOTMPDIR = tempDir;
  }
  const base = {
    cwd: folder,
    env,
    stdin: runner.run?.stdin ?? false,
    stop: { mode: runner.stop.mode, graceMs: runner.stop.graceMs },
    ...(port === undefined ? {} : { port, url: `http://127.0.0.1:${port}` }),
    ...(chosen?.portFallback === undefined ? {} : { portFallback: chosen.portFallback }),
    ...(tempDir === undefined ? {} : { tempDir }),
  };

  if (request.kind === "static") {
    if (deps.serveStatic === undefined || port === undefined) {
      return {
        failure: {
          code: "RUN_FAILED",
          params: { name: request.name },
          debug: "static pages need a page server",
        },
      };
    }
    return { ...base, argv: [], serve: deps.serveStatic({ folder, port }) };
  }

  const expanded = expandCommand(runner.run?.command ?? [], {
    ...(port === undefined ? {} : { port }),
    ...(subject.entry === undefined ? {} : { entry: subject.entry }),
    dir: folder,
    name: request.name,
  });
  const failure = startupFailure(step);
  return {
    ...base,
    argv: await resolveExecutable(deps.platform, expanded, step.checked, folder, env),
    ...(runner.ready === undefined
      ? {}
      : { ready: runner.ready, slowAfterMs: runner.ready.slowAfterMs }),
    ...(failure === undefined ? {} : { startupFailure: failure }),
  };
}
