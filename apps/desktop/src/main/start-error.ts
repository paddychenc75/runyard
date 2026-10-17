import { isClientError } from "@runyard/client";
import type { DesktopError } from "../shared/library-state.ts";
import { FAILURE_CODES } from "./build-library-state.ts";
import { toDesktopError } from "./desktop-error.ts";

export type StartErrorOutcome =
  /** 预览区有专门画面的启动失败（缺工具、依赖安装失败等），带管理进程给的参数 */
  | { kind: "failure"; error: DesktopError }
  /** 等就绪超时：不算错误，较慢的启动有自己的画面 */
  | { kind: "slow" }
  /** 其余错误，报在全局错误里 */
  | { kind: "other"; error: DesktopError };

export function classifyStartError(error: unknown): StartErrorOutcome {
  const known = isClientError(error) ? error.known : undefined;
  if (known !== undefined && FAILURE_CODES.includes(known.code)) {
    return {
      kind: "failure",
      error: { code: known.code, params: known.params as Record<string, unknown> },
    };
  }
  if (known?.code === "READY_TIMEOUT") return { kind: "slow" };
  return { kind: "other", error: toDesktopError(error) };
}
