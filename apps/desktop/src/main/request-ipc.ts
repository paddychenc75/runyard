import { type RequestResult, type RequestSpec, requestSpecSchema } from "@runyard/protocol";
import type { RequestMethod } from "../shared/request-bridge.ts";
import type { LibraryController } from "./library-controller.ts";

// 把界面发来的请求面板消息接到控制器上。页面发来的数据不可信：请求按协议的形状校验
// （路径必须以 / 开头、方法只有 GET POST PUT PATCH DELETE），不合的不发，回 invalid-request。

const invalid: RequestResult = { outcome: "failed", reason: "invalid-request", durationMs: 0 };

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function sendParam(value: unknown): { id: string; request: RequestSpec } | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, request } = value as Record<string, unknown>;
  const parsed = requestSpecSchema.safeParse(request);
  return text(id) === null || !parsed.success ? null : { id: id as string, request: parsed.data };
}

export function requestMethods(
  controller: Pick<LibraryController, "runBar">,
): Record<RequestMethod, (param: unknown) => unknown> {
  const { runBar } = controller;
  return {
    "request.send": async (value) => {
      const param = sendParam(value);
      return param === null ? invalid : await runBar.sendRequest(param.id, param.request);
    },
    "request.getLast": async (id) => {
      const playground = text(id);
      return playground === null ? null : await runBar.lastRequest(playground);
    },
    "request.setAutoResend": async (value) => {
      if (typeof value !== "object" || value === null) return;
      const { id, enabled } = value as Record<string, unknown>;
      const playground = text(id);
      if (playground !== null && typeof enabled === "boolean") {
        await runBar.setRequestAutoResend(playground, enabled);
      }
    },
    "request.openInBrowser": (value) => {
      if (typeof value !== "object" || value === null) return;
      const { id, path } = value as Record<string, unknown>;
      const playground = text(id);
      if (playground !== null && typeof path === "string") {
        runBar.openRequestInBrowser(playground, path);
      }
    },
  };
}
