import type { EventName } from "@runyard/protocol";
import type { SupervisorApi } from "./supervisor-api.ts";

// 改名与移到废纸篓的第 2、3 步（技术设计 §4.3）：向所有已连接的客户端广播
// playground.releaseRequested，等它们用 playground.released 回报，最多 3 秒；超时的记一行日志后继续。
// “所有已连接的客户端”按能收到这个事件的连接算：没订阅 playground 主题的连接（比如命令行）
// 收不到请求，也就不会回报，等它们只会白白拖满 3 秒。

export const RELEASE_TIMEOUT_MS = 3000;
const RELEASE_EVENT = "playground.releaseRequested" satisfies EventName;

interface Waiting {
  readonly playgroundId: string;
  readonly sessions: Set<number>;
  readonly done: () => void;
}

export interface ReleaseCoordinator {
  request(playgroundId: string, reason: "rename" | "trash"): Promise<void>;
  /** playground.released 的处理 */
  released(sessionId: number, playgroundId: string): void;
  /** 连接断开：它不会再回报，不用等了 */
  sessionClosed(sessionId: number): void;
}

export function createReleaseCoordinator(
  api: SupervisorApi,
  log: (line: string) => void,
  timeoutMs: number = RELEASE_TIMEOUT_MS,
): ReleaseCoordinator {
  const waiting = new Set<Waiting>();

  const settle = (entry: Waiting) => {
    if (entry.sessions.size > 0) return;
    waiting.delete(entry);
    entry.done();
  };

  return {
    async request(playgroundId, reason) {
      const sessions = new Set(
        api
          .readySessions()
          .filter((session) => session.wouldReceive(RELEASE_EVENT))
          .map((session) => session.id),
      );
      if (sessions.size === 0) return;
      await new Promise<void>((resolve) => {
        const timer = api.clock.setTimeout(() => {
          waiting.delete(entry);
          log(
            `release timeout: playground=${playgroundId} reason=${reason} sessions=${[...entry.sessions].join(",")}`,
          );
          resolve();
        }, timeoutMs);
        const entry: Waiting = {
          playgroundId,
          sessions,
          done: () => {
            api.clock.clearTimeout(timer);
            resolve();
          },
        };
        waiting.add(entry);
        api.publish(RELEASE_EVENT, { playgroundId, reason });
      });
    },
    released(sessionId, playgroundId) {
      for (const entry of [...waiting]) {
        if (entry.playgroundId !== playgroundId) continue;
        entry.sessions.delete(sessionId);
        settle(entry);
      }
    },
    sessionClosed(sessionId) {
      for (const entry of [...waiting]) {
        entry.sessions.delete(sessionId);
        settle(entry);
      }
    },
  };
}
