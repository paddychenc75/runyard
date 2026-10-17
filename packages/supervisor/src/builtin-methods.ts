import { type EventName, type EventTopic, eventRegistry } from "@runyard/protocol";
import { type HandlerMap, HandlerOutcome } from "./dispatch.ts";
import type { SupervisorIdentity } from "./supervisor-options.ts";

// 会话组和事件订阅里归 supervisor 自己的方法（技术设计 §5.2）。
// session.bye 在这里只做“关掉这条连接”；停掉这条连接名下标签页持有的运行是运行持有者的事（#40），通过 onBye 接上。

export interface BuiltinDeps {
  identity: SupervisorIdentity;
  runCount(): number;
  /** 除了这条连接之外，是否还有桌面应用连着（换新管理进程前要问：应用正在用它） */
  otherAppConnected(sessionId: number): boolean;
  /** 接缝：session.bye 之前要做的事（#40：停掉标签页持有的运行，最多等 5 秒） */
  onBye(sessionId: number): Promise<void>;
}

// 一个事件属于哪个主题：事件名第一个点之前的部分，只有登记表里标了主题的才能经 events.subscribe 收到
function topicOf(event: EventName): EventTopic | null {
  const topic = eventRegistry[event].topic;
  return topic === null || topic === "logs.follow" ? null : topic;
}

export function createBuiltinHandlers(deps: BuiltinDeps): HandlerMap {
  const { identity } = deps;
  return {
    ping: () => ({}),
    "session.bye": async (_params, { session }) => {
      await deps.onBye(session.id);
      return new HandlerOutcome({}, { closeAfter: true });
    },
    "supervisor.info": () => ({
      protocol: identity.protocol,
      version: identity.version,
      build: identity.build,
      startedBy: identity.startedBy,
      runs: deps.runCount(),
    }),
    "supervisor.shutdown": ({ ifIdle, reason }, { api, session }) => {
      // 有条件关闭只在没有运行时才退出；有运行时保持服务，运行不受影响（SUPERVISOR-LIFECYCLE-15）
      if (ifIdle && deps.runCount() > 0) return { closing: false };
      // 别的版本的命令行换新（reason: upgrade）不能把正在被桌面应用使用的管理进程换掉：
      // 换掉后应用连着的是已退出的进程，再也看不到命令行新建的项目（#358）
      if (ifIdle && reason === "upgrade" && deps.otherAppConnected(session.id)) {
        return { closing: false };
      }
      // 响应先到客户端手里，再关；否则客户端只看到连接断开，分不清是“已关闭”还是出错
      return new HandlerOutcome({ closing: true }, { after: () => void api.shutdown(reason) });
    },
    "events.subscribe": ({ topics }, { session }) => {
      const wanted = new Set<EventTopic>(topics);
      const sub = session.addSubscription((event) => {
        const topic = topicOf(event);
        return topic !== null && wanted.has(topic);
      });
      return { sub };
    },
    // 取消不存在的订阅不是错误：客户端重复取消或订阅已随连接消失，结果都是“没有这个订阅”
    "events.unsubscribe": ({ sub }, { session }) => {
      session.removeSubscription(sub);
      return {};
    },
  };
}
