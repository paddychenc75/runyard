import { isClientError } from "@runyard/client";
import type { Localized, Translate } from "@runyard/i18n";
import { isPlatformError } from "@runyard/platform";
import {
  type ErrorCause,
  type ErrorCode,
  type ErrorParams,
  errorRegistry,
} from "@runyard/protocol";

// 命令失败时抛出的错误：协议里的错误码加参数，自己不产生句子（技术设计 §5.1、§6.8）。
// 退出码从错误码登记表取（exitCodeOf），这里不另存一张表。

/** 用法错误的补充说明：只给人看；`--json` 里取它的英文版放进 message */
export type UsageDetail = (t: Translate) => Localized;

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly params: Readonly<Record<string, unknown>>;
  readonly errorCause: ErrorCause | undefined;
  readonly detail: UsageDetail | undefined;

  constructor(
    code: ErrorCode,
    params: Readonly<Record<string, unknown>>,
    extras: { cause?: ErrorCause; detail?: UsageDetail } = {},
  ) {
    super(code);
    this.name = "CliError";
    this.code = code;
    this.params = params;
    this.errorCause = extras.cause;
    this.detail = extras.detail;
  }
}

export function cliError<C extends ErrorCode>(
  code: C,
  params: ErrorParams<C>,
  extras: { cause?: ErrorCause; detail?: UsageDetail } = {},
): CliError {
  return new CliError(code, params, extras);
}

export function usageError(detail: UsageDetail): CliError {
  return new CliError("USAGE", {}, { detail });
}

export function exitCodeOf(code: ErrorCode): number {
  return errorRegistry[code].exit;
}

// 把任何被抛出的东西变成 CliError。客户端和平台层的错误原样带着代码和参数；
// 管理进程返回了本客户端不认识的错误码（known 为空）时按 INTERNAL 处理：不认识的代码没有文案也没有退出码；
// 其余没预料到的异常同样是 INTERNAL，错误里不放堆栈和 debug（规格 CLI-COMMANDS-10）。
export function toCliError(thrown: unknown): CliError {
  if (thrown instanceof CliError) return thrown;
  const known = isClientError(thrown)
    ? thrown.known
    : isPlatformError(thrown)
      ? thrown.error
      : undefined;
  if (known === undefined) return new CliError("INTERNAL", {});
  return new CliError(known.code, known.params, known.cause ? { cause: known.cause } : {});
}
