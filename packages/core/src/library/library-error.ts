import type { ErrorCode, ErrorParams, RunyardError } from "@runyard/protocol";

// 资源库操作抛出的错误：携带协议里的 RunyardError（代码加参数），自己不产生句子。
// 形状与平台层的 PlatformError 相同，但 core 不借用平台层的外壳，调用方按 `error.code` 分支即可。
export class LibraryError<C extends ErrorCode = ErrorCode> extends Error {
  readonly error: RunyardError<C>;

  constructor(error: RunyardError<C>) {
    super(`${error.code}: ${error.debug}`);
    this.name = "LibraryError";
    this.error = error;
  }
}

// debug 是只进日志的英文诊断（协议规定，任何客户端都不许显示）
export function libraryError<C extends ErrorCode>(
  code: C,
  params: ErrorParams<C>,
  debug: string,
): LibraryError<C> {
  return new LibraryError({ code, params, debug } as RunyardError<C>);
}

export function isLibraryError(value: unknown): value is LibraryError {
  return value instanceof LibraryError;
}
