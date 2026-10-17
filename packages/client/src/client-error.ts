import {
  type ErrorCode,
  type ErrorParams,
  type RunyardError,
  type SupervisorStartFailure,
  toKnownError,
  type WireError,
} from "@runyard/protocol";

// 客户端抛出的统一错误：携带协议里的错误形状（代码加参数），自己不产生句子。
// 管理进程返回的错误码可能比本客户端新（规格 PROTOCOL-HANDSHAKE-17），所以 error 也可以是
// 没登记过的 WireError：调用方用 known 判断，认不得的就显示通用的一句话加原始 code，debug 只写日志。
export class ClientError extends Error {
  readonly error: RunyardError | WireError;

  constructor(error: RunyardError | WireError) {
    super(`${error.code}: ${error.debug}`);
    this.name = "ClientError";
    this.error = error;
  }

  get code(): string {
    return this.error.code;
  }

  /** 登记过的错误码才有；没登记（新版管理进程才有的代码）时是 undefined */
  get known(): RunyardError | undefined {
    return toKnownError(this.error);
  }
}

// debug 是一句只进日志的英文诊断，任何客户端都不许显示
export function clientError<C extends ErrorCode>(
  code: C,
  params: ErrorParams<C>,
  debug: string,
): ClientError {
  return new ClientError({ code, params, debug } as RunyardError<C>);
}

export function isClientError(value: unknown): value is ClientError {
  return value instanceof ClientError;
}

export function unavailable(debug: string, reason?: SupervisorStartFailure): ClientError {
  return clientError("SUPERVISOR_UNAVAILABLE", reason === undefined ? {} : { reason }, debug);
}
