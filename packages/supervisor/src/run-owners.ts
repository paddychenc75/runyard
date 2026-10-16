import type { Session } from "./session.ts";
import type { SupervisorClock } from "./supervisor-clock.ts";

// 标签页持有的运行绑定到“应用的连接”（规格 run/ownership）。
// 持有者里的 clientId 是应用主进程给的身份；连接断开后先留宽限期等重连，到期才由 onExpire 停掉它名下的运行。
// 规格没有说“同一个应用”怎么认：这里认两样——带着同一个 clientId 的请求，或者同一类客户端同一个进程号的新连接。

export const DISCONNECT_GRACE_MS = 5000;

interface Binding {
  sessionId: number | undefined;
  /** 最近绑定的那条连接的客户端种类与进程号，重连时据此认回 */
  kind: string;
  pid: number;
  timer: number | undefined;
}

export class OwnerBindings {
  readonly #clock: SupervisorClock;
  readonly #graceMs: number;
  readonly #onExpire: (clientId: string) => void;
  readonly #bindings = new Map<string, Binding>();

  constructor(deps: {
    clock: SupervisorClock;
    graceMs?: number;
    onExpire: (clientId: string) => void;
  }) {
    this.#clock = deps.clock;
    this.#graceMs = deps.graceMs ?? DISCONNECT_GRACE_MS;
    this.#onExpire = deps.onExpire;
  }

  /** 这条连接现在代表 clientId；取消正在走的宽限期 */
  bind(clientId: string, session: Session): void {
    const previous = this.#bindings.get(clientId);
    if (previous?.timer !== undefined) this.#clock.clearTimeout(previous.timer);
    this.#bindings.set(clientId, {
      sessionId: session.id,
      kind: session.info?.kind ?? "",
      pid: session.info?.pid ?? 0,
      timer: undefined,
    });
  }

  /** 已经认识的 clientId 出现在新连接上（比如 attach）：当作重连。不认识的不登记 */
  reconnect(clientId: string, session: Session): void {
    if (this.#bindings.has(clientId)) this.bind(clientId, session);
  }

  /** 这条连接名下的 clientId */
  clientsOf(sessionId: number): string[] {
    return [...this.#bindings].filter(([, b]) => b.sessionId === sessionId).map(([id]) => id);
  }

  /** 新连接握手完成：宽限期里有同一类客户端、同一个进程号的，当作它回来了 */
  sessionReady(session: Session): void {
    const info = session.info;
    if (info === undefined) return;
    for (const [clientId, binding] of this.#bindings) {
      if (binding.timer !== undefined && binding.kind === info.kind && binding.pid === info.pid) {
        this.bind(clientId, session);
      }
    }
  }

  /** 连接断开（非正常）：它名下的 clientId 各开始一个宽限期 */
  sessionLost(sessionId: number): void {
    for (const clientId of this.clientsOf(sessionId)) {
      const binding = this.#bindings.get(clientId);
      if (binding === undefined) continue;
      binding.sessionId = undefined;
      binding.timer = this.#clock.setTimeout(() => {
        this.#bindings.delete(clientId);
        this.#onExpire(clientId);
      }, this.#graceMs);
    }
  }

  /** 不再管这个 clientId（session.bye 已经停完它的运行） */
  release(clientId: string): void {
    const binding = this.#bindings.get(clientId);
    if (binding?.timer !== undefined) this.#clock.clearTimeout(binding.timer);
    this.#bindings.delete(clientId);
  }

  dispose(): void {
    for (const binding of this.#bindings.values()) {
      if (binding.timer !== undefined) this.#clock.clearTimeout(binding.timer);
    }
    this.#bindings.clear();
  }
}
