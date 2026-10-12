import type { Socket } from "node:net";
import type { EventData, EventName } from "@runyard/protocol";
import type { ServerHandshake } from "./handshake-server.ts";
import { Session, type SessionCloseReason, type SessionDeps } from "./session.ts";
import type { SupervisorClock } from "./supervisor-clock.ts";

// 管理所有连接：编号、握手完成的名单、事件分发、关闭时收尾。

export interface SessionManagerConfig {
  clock: SupervisorClock;
  handshakeTimeoutMs: number;
  maxPendingEventBytes: number;
  supervisor: SessionDeps["supervisor"];
  newHandshake(): ServerHandshake;
  handle: SessionDeps["handle"];
  onReady(session: Session): void;
  onClosed(session: Session, reason: SessionCloseReason): void;
  /** 连接个数变了（含还没握手的） */
  onCountChanged(): void;
}

export interface SessionManager {
  accept(socket: Socket): void;
  count(): number;
  ready(): readonly Session[];
  publish<E extends EventName>(event: E, data: EventData<E>): void;
  /** 把所有连接收掉：先礼貌地关（送完已写的内容），超过 graceMs 强行断开 */
  closeAll(graceMs: number): Promise<void>;
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  const sessions = new Set<Session>();
  let nextId = 1;

  const deps = (): SessionDeps => ({
    handshake: config.newHandshake(),
    clock: config.clock,
    handshakeTimeoutMs: config.handshakeTimeoutMs,
    maxPendingEventBytes: config.maxPendingEventBytes,
    supervisor: config.supervisor,
    handle: config.handle,
    onReady: (session) => config.onReady(session),
    onClosed(session, reason, wasReady) {
      sessions.delete(session);
      if (wasReady) config.onClosed(session, reason);
      config.onCountChanged();
    },
  });

  return {
    accept(socket) {
      const session = new Session(nextId++, socket, deps());
      sessions.add(session);
      session.start();
      config.onCountChanged();
    },
    count: () => sessions.size,
    ready: () => [...sessions].filter((session) => session.ready),
    publish(event, data) {
      for (const session of sessions) session.deliver(event, data);
    },
    async closeAll(graceMs) {
      const closing = [...sessions];
      if (closing.length === 0) return;
      for (const session of closing) session.end("shutdown");
      const timer = config.clock.setTimeout(() => {
        for (const session of closing) session.destroyNow();
      }, graceMs);
      await Promise.all(closing.map((session) => session.socketClosed));
      config.clock.clearTimeout(timer);
    },
  };
}
