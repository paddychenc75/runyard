import type { Socket } from "node:net";
import { platformError } from "../../platform-error.ts";

// 连接，限时。所有连不上的原因（没有监听者、权限不够、超时）对调用方都是同一件事：
// 管理进程不可用，是否去启动它由调用方决定（技术设计 §5.1）。
export function connectWithTimeout(
  createSocket: () => Socket,
  timeoutMs: number,
  endpoint: string,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createSocket();
    const fail = (reason: string) => {
      clearTimeout(timer);
      socket.destroy();
      reject(platformError("SUPERVISOR_UNAVAILABLE", {}, `${reason} (${endpoint})`));
    };
    const timer = setTimeout(() => fail(`no connection within ${timeoutMs} ms`), timeoutMs);
    socket.once("error", (error: NodeJS.ErrnoException) => fail(error.code ?? error.message));
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.removeAllListeners("error");
      resolve(socket);
    });
  });
}
