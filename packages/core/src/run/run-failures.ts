import type { ErrorCause, FailureReason, RunyardError } from "@runyard/protocol";

// 引擎自己产生的错误：现场（退出码、输出末尾）原样放进 cause，debug 只给日志看。

export function internalFailure(name: string, error: unknown): RunyardError<FailureReason> {
  return {
    code: "RUN_FAILED",
    params: { name },
    debug: `run could not be started: ${String(error)}`,
  };
}

export function runFailedBeforeReady(name: string, cause: ErrorCause): RunyardError<FailureReason> {
  return {
    code: "RUN_FAILED",
    params: { name },
    debug: "process exited before it was ready",
    cause,
  };
}

export function scriptErrored(name: string, cause: ErrorCause): RunyardError {
  return {
    code: "SCRIPT_ERRORED",
    params: { name },
    debug: "script exited with a non-zero code",
    cause,
  };
}
