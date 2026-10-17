import type { ProjectFlushReply } from "../shared/desktop-bridge.ts";

// 改名、移到废纸篓之前问界面：这个项目的编辑器有没有未保存的修改要写入（规格 DESKTOP-EDITOR-75 至 78）。
// 和退出前的 QuitFlushGate 同一个办法：界面收到请求先回 ack，写文件、等用户回答可能花很久，所以只给“有没有回应”设时限；
// 界面不回应（崩溃、没加载出来）就放行。区别是同时可以有几个项目在问，请求带项目 id 和“能不能问用户”。

/** 界面应当在这么久之内回 ack */
export const FLUSH_ACK_TIMEOUT_MS = 3000;

interface Pending {
  settle: (proceed: boolean) => void;
  ackTimer: ReturnType<typeof setTimeout>;
}

export class ProjectFlushGate {
  readonly #send: (id: number, project: string, ask: boolean) => boolean;
  readonly #ackTimeoutMs: number;
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;

  /** send 把请求发给界面，发不出去（窗口已销毁）返回 false */
  constructor(
    send: (id: number, project: string, ask: boolean) => boolean,
    ackTimeoutMs = FLUSH_ACK_TIMEOUT_MS,
  ) {
    this.#send = send;
    this.#ackTimeoutMs = ackTimeoutMs;
  }

  /** ask 为真时自动保存关着的会问用户；true = 可以继续，false = 用户取消了 */
  request(project: string, ask: boolean): Promise<boolean> {
    const id = this.#nextId++;
    return new Promise<boolean>((resolve) => {
      const settle = (proceed: boolean): void => {
        clearTimeout(entry.ackTimer);
        this.#pending.delete(id);
        resolve(proceed);
      };
      const entry: Pending = {
        settle,
        ackTimer: setTimeout(() => settle(true), this.#ackTimeoutMs),
      };
      this.#pending.set(id, entry);
      if (!this.#send(id, project, ask)) settle(true);
    });
  }

  /** 界面的回话；过期的、不认识的编号不理 */
  reply({ id, reply }: ProjectFlushReply): void {
    const entry = this.#pending.get(id);
    if (entry === undefined) return;
    // 收到了：此后不设时限，用户可能正在回答询问
    if (reply === "ack") clearTimeout(entry.ackTimer);
    else entry.settle(reply === "proceed");
  }

  /** 界面进程没了，不会再有回话 */
  abandon(): void {
    for (const entry of [...this.#pending.values()]) entry.settle(true);
  }
}
