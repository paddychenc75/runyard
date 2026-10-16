import type { Platform } from "@runyard/platform";
import type { FailureReason, Notice, RunyardError, ToolDefinition } from "@runyard/protocol";
import type { PortRange } from "../ports/port-range.ts";
import type { RunClock } from "../run/run-clock.ts";
import type { RunNetworkSettings } from "../run/run-env.ts";
import type { PrepareContext, StartRequest } from "../run/run-types.ts";
import type { ToolchainResult, ToolchainService } from "../toolchain/toolchain-service.ts";
import type { RunSubject, StaticServer } from "./prepare-types.ts";

// 准备阶段几个步骤共用的类型。

export type RunPreparerDeps = {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly toolchain: Pick<ToolchainService, "check">;
  /** 项目此刻的事实：文件夹、运行器、requires、登记的端口 */
  readonly resolve: (request: StartRequest) => Promise<RunSubject>;
  /** 应用认识的工具定义，只用来选安装提示 */
  readonly definitions: ReadonlyMap<string, ToolDefinition>;
  readonly portRange?: () => PortRange;
  readonly network?: () => RunNetworkSettings | undefined;
  readonly serveStatic?: StaticServer;
};

/** 一次准备的现场：前一步的结果交给后一步 */
export type PrepareStep = {
  readonly deps: RunPreparerDeps;
  readonly context: PrepareContext;
  readonly subject: RunSubject;
  readonly checked: ToolchainResult;
  /** 给定端口时造子进程环境（登录环境为底） */
  envFor(port?: number): Record<string, string>;
  log(notice: Notice): void;
};

export type StepFailure = { readonly failure: RunyardError<FailureReason> };

export function isFailure<T>(value: T | StepFailure): value is StepFailure {
  return typeof value === "object" && value !== null && "failure" in value;
}
