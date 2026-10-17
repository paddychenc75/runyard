import type { RequestResult, RunState } from "@runyard/protocol";
import type { HandlerMap } from "./dispatch.ts";
import { methodFailure } from "./method-failure.ts";
import { type SendOptions, sendLocalRequest } from "./request-send.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// request.* 方法的登记（规格 desktop/request-panel）。参数已按登记表校验。

export interface RequestDeps {
  /** 项目当前（最近一次）的运行；端口在运行起来之后才有 */
  readonly currentRun: (
    playgroundId: string,
  ) => { readonly state: RunState; readonly port: number | undefined } | undefined;
  /** 从请求面板发出的请求算一次活动（规格 DESKTOP-REQUEST-PANEL-13，口径同 idle-stop） */
  readonly touch: (playgroundId: string) => void;
  /** 真正发出请求；测试换成替身（缺省是 sendLocalRequest） */
  readonly send?: (options: SendOptions) => Promise<RequestResult>;
}

export function createRequestHandlers(api: SupervisorApi, deps: RequestDeps): HandlerMap {
  const resolve = async (ref: string) => {
    const library = await api.openLibrary();
    const item = library.find(ref);
    if (item === undefined) {
      throw methodFailure("PLAYGROUND_NOT_FOUND", { name: ref }, `no playground ${ref}`);
    }
    return { library, item };
  };

  return {
    "request.send": async ({ playground, request }) => {
      const { library, item } = await resolve(playground);
      const id = item.entry.id;
      const run = deps.currentRun(id);
      // 只有就绪的服务收请求：启动中、重载中、已停止、崩溃都不发（规格 DESKTOP-REQUEST-PANEL-06）
      if (run === undefined || run.state !== "ready" || run.port === undefined) {
        return notReady();
      }
      deps.touch(id);
      const result = await (deps.send ?? sendLocalRequest)({
        port: run.port,
        request,
        clock: api.clock,
      });
      // 发出去了就算“上一次请求”，不管结果如何；写不进去（文件是更新版本写的等）不影响这次响应
      await library.update(id, { lastRequest: request }).catch(() => undefined);
      return result;
    },
    "request.getLast": async ({ playground }) => {
      const { library, item } = await resolve(playground);
      const read = await library.readFile(item);
      return read.status === "ok" ? (read.value.lastRequest ?? null) : null;
    },
  };
}

const notReady = (): RequestResult => ({ outcome: "failed", reason: "not-ready", durationMs: 0 });
