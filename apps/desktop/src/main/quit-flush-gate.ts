import type { QuitReply } from "../shared/desktop-bridge.ts";

// 退出前先问界面：编辑器有没有未保存的修改要写入或询问（规格 DESKTOP-EDITOR-27、28）。
// 界面收到请求先回 ack，之后写文件、等用户回答可能花很久，所以只给“有没有回应”设时限；
// 界面不回应（崩溃、没加载出来）就放行，不让 ⌘Q 失灵。

/** 界面应当在这么久之内回 ack */
export const ACK_TIMEOUT_MS = 3000;

interface Pending {
  id: number;
  promise: Promise<boolean>;
  settle: (proceed: boolean) => void;
  ackTimer: ReturnType<typeof setTimeout>;
}

export class QuitFlushGate {
  readonly #send: (id: number) => boolean;
  readonly #ackTimeoutMs: number;
  #nextId = 1;
  #pending: Pending | null = null;

  /** send 把请求发给界面，发不出去（窗口已销毁）返回 false */
  constructor(send: (id: number) => boolean, ackTimeoutMs = ACK_TIMEOUT_MS) {
    this.#send = send;
    this.#ackTimeoutMs = ackTimeoutMs;
  }

  /** 问一次；true = 可以继续退出，false = 用户取消了。已经在问的话共用那一次 */
  request(): Promise<boolean> {
    if (this.#pending !== null) return this.#pending.promise;
    const id = this.#nextId++;
    let settle: (proceed: boolean) => void = () => {};
    const promise = new Promise<boolean>((resolve) => {
      settle = (proceed) => {
        clearTimeout(pending.ackTimer);
        if (this.#pending === pending) this.#pending = null;
        resolve(proceed);
      };
    });
    const pending: Pending = {
      id,
      promise,
      settle: (proceed) => settle(proceed),
      ackTimer: setTimeout(() => settle(true), this.#ackTimeoutMs),
    };
    this.#pending = pending;
    if (!this.#send(id)) settle(true);
    return promise;
  }

  /** 界面的回话；过期的、不认识的编号不理 */
  reply({ id, reply }: QuitReply): void {
    const pending = this.#pending;
    if (pending === null || pending.id !== id) return;
    // 收到了：此后不设时限，用户可能正在回答询问
    if (reply === "ack") clearTimeout(pending.ackTimer);
    else pending.settle(reply === "proceed");
  }

  /** 界面进程没了，不会再有回话 */
  abandon(): void {
    this.#pending?.settle(true);
  }
}
