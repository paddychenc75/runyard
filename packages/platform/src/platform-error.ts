import type { ErrorCode, ErrorParams, RunyardError } from "@runyard/protocol";

// 平台层抛出的错误：携带协议里的 RunyardError（代码加参数），自己不产生句子。
// protocol 只定义数据形状，不放逻辑，所以可抛出的外壳在这里。
export class PlatformError<C extends ErrorCode = ErrorCode> extends Error {
  readonly error: RunyardError<C>;

  constructor(error: RunyardError<C>) {
    super(`${error.code}: ${error.debug}`);
    this.name = "PlatformError";
    this.error = error;
  }
}

// debug 是一句只进日志的英文诊断（协议规定，任何客户端都不许显示）
export function platformError<C extends ErrorCode>(
  code: C,
  params: ErrorParams<C>,
  debug: string,
): PlatformError<C> {
  return new PlatformError({ code, params, debug } as RunyardError<C>);
}

export function isPlatformError(value: unknown): value is PlatformError {
  return value instanceof PlatformError;
}
