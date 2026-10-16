import type { HandlerMap } from "./dispatch.ts";
import { methodFailure } from "./method-failure.ts";
import type { RunLogService } from "./run-log-service.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// logs.* 方法的登记（规格 run/logs）。参数已按登记表校验。

export function createLogHandlers(api: SupervisorApi, service: RunLogService): HandlerMap {
  // 日志按项目 id 存；调用方可以传 id 或名称
  const resolve = async (ref: string): Promise<string> => {
    const item = (await api.openLibrary()).find(ref);
    if (item === undefined) {
      throw methodFailure("PLAYGROUND_NOT_FOUND", { name: ref }, `no playground ${ref}`);
    }
    return item.entry.id;
  };

  return {
    "logs.read": async ({ playground, since, tail, raw }) =>
      service.read(await resolve(playground), {
        ...(since === undefined ? {} : { since }),
        ...(tail === undefined ? {} : { tail }),
        ...(raw === undefined ? {} : { raw }),
      }),
    // 只推订阅之后的新条目；since、tail 对订阅没有意义，要历史就先 logs.read 再 follow
    "logs.follow": async ({ playground, raw }, { session }) => {
      const playgroundId = await resolve(playground);
      // 订阅本身不接受任何经 publish 发出的事件：run.log 只由日志服务按项目点对点推送
      const sub = session.addSubscription(() => false);
      service.follow(session, sub, playgroundId, raw === true);
      return { sub };
    },
    "logs.clear": async ({ playground }) => {
      await service.clear(await resolve(playground));
      return {};
    },
  };
}
