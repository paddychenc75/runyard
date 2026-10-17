import { isClientError } from "@runyard/client";
import type { DesktopError } from "../shared/library-state.ts";

/** 管理进程的失败转成界面看的“代码加参数”；不认识的失败按 INTERNAL */
export function toDesktopError(error: unknown): DesktopError {
  const known = isClientError(error) ? error.known : undefined;
  return known === undefined
    ? { code: "INTERNAL", params: {} }
    : { code: known.code, params: known.params as Record<string, unknown> };
}
