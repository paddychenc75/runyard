import {
  isMethodName,
  type MethodName,
  type MethodParams,
  type MethodResult,
  methodRegistry,
  type RequestFrame,
  type RunyardError,
} from "@runyard/protocol";
import { toRunyardError } from "./method-failure.ts";
import type { Reply, Session } from "./session.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 方法分发：按方法登记表校验入参，调用登记的处理函数，再按登记表校验出参。
// 处理函数由 supervisor 自己（会话组、事件订阅）和后续 issue（运行 #40、资源库与设置 #41、日志 #43）登记。

export interface RequestContext {
  readonly session: Session;
  readonly api: SupervisorApi;
}

/** 处理函数的返回值除了出参，还可以带“响应写出之后”的动作；用类是为了不和恰好叫 result 的出参字段混淆 */
export class HandlerOutcome<M extends MethodName = MethodName> {
  readonly result: MethodResult<M>;
  readonly effects: { closeAfter?: boolean; after?: () => void };

  constructor(result: MethodResult<M>, effects: { closeAfter?: boolean; after?: () => void } = {}) {
    this.result = result;
    this.effects = effects;
  }
}

export type MethodHandler<M extends MethodName> = (
  params: MethodParams<M>,
  context: RequestContext,
) => Promise<MethodResult<M> | HandlerOutcome<M>> | MethodResult<M> | HandlerOutcome<M>;

export type HandlerMap = { [M in MethodName]?: MethodHandler<M> };

type AnyHandler = (params: unknown, context: RequestContext) => unknown;

function failed(id: number, error: RunyardError): Reply {
  return { frame: { t: "res", id, ok: false, error } };
}

// 方法名不在登记表里，或登记了但这个管理进程还没有处理函数（以后的 issue 才加）：
// 都回 NOT_SUPPORTED（退出码 10，“当前版本没有这个功能”）。协议文档把“未知方法返回哪个错误码”留为未定，
// 这里选 NOT_SUPPORTED：新客户端调旧管理进程时它最贴切，USAGE 说的是“入参不合法”
function notSupported(id: number, method: string): Reply {
  return failed(id, {
    code: "NOT_SUPPORTED",
    params: {},
    debug: `method not supported: ${method}`,
  });
}

export function createDispatcher(handlers: HandlerMap, api: SupervisorApi) {
  return async function handle(session: Session, request: RequestFrame): Promise<Reply> {
    const { id, method } = request;
    // 已握手但协议低于最低要求的客户端：按版本表报 CLIENT_OUTDATED，不处理
    if (session.clientOutdated !== undefined) return failed(id, session.clientOutdated);
    if (!isMethodName(method)) return notSupported(id, method);
    const handler = (handlers as Record<string, AnyHandler | undefined>)[method];
    const definition = methodRegistry[method];
    if (handler === undefined || definition.status === "reserved") return notSupported(id, method);

    const params = definition.params.safeParse(request.params);
    if (!params.success) {
      return failed(id, {
        code: "USAGE",
        params: {},
        debug: `invalid params for ${method}: ${params.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      });
    }
    try {
      const returned = await handler(params.data, { session, api });
      const outcome = returned instanceof HandlerOutcome ? returned : new HandlerOutcome(returned);
      const result = definition.result.safeParse(outcome.result);
      // 出参不符合登记表是处理函数的缺陷，不把不合规的数据发给客户端
      if (!result.success) {
        return failed(id, { code: "INTERNAL", params: {}, debug: `invalid result from ${method}` });
      }
      return {
        frame: { t: "res", id, ok: true, result: result.data },
        closeAfter: outcome.effects.closeAfter,
        after: outcome.effects.after,
      };
    } catch (thrown) {
      return failed(id, toRunyardError(thrown));
    }
  };
}
