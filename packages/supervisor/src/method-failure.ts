import { isPlatformError } from "@runyard/platform";
import type { ErrorCode, ErrorParams, RunyardError } from "@runyard/protocol";

// 方法处理函数用抛 MethodFailure 的方式返回协议错误（代码加参数，没有句子）。
// 别的异常一律当作缺陷，变成 INTERNAL，细节只进 debug。
export class MethodFailure extends Error {
  readonly error: RunyardError;

  constructor(error: RunyardError) {
    super(`${error.code}: ${error.debug}`);
    this.name = "MethodFailure";
    this.error = error;
  }
}

export function methodFailure<C extends ErrorCode>(
  code: C,
  params: ErrorParams<C>,
  debug: string,
): MethodFailure {
  return new MethodFailure({ code, params, debug } as RunyardError);
}

// 平台层的错误本来就是 RunyardError 的外壳，原样转出
export function toRunyardError(thrown: unknown): RunyardError {
  if (thrown instanceof MethodFailure) return thrown.error;
  if (isPlatformError(thrown)) return thrown.error;
  const debug = thrown instanceof Error ? thrown.message : "non-error value thrown";
  return { code: "INTERNAL", params: {}, debug };
}
