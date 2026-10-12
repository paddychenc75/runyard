import { createHash } from "node:crypto";
import { createServer } from "node:net";
import type { AbsPath } from "../../path-types.ts";
import type { KernelLock, LockStrategy } from "./kernel-lock.ts";

// Linux：抽象命名空间 socket 作锁。名字含状态目录的摘要，所以不同状态目录（开发版和正式版）互不干扰；
// 进程一死内核就回收这个名字。抽象 socket 没有权限控制：别的用户能抢这个名字让管理进程起不来
// （不能冒充，也连不进真正的连接点），记为已接受的风险（决策记录 0005）。
export function abstractSocketLock(stateDir: AbsPath): LockStrategy {
  const digest = createHash("sha256").update(stateDir).digest("hex").slice(0, 16);
  const name = `\0runyard-lock-${digest}`;
  return {
    acquire() {
      return new Promise<KernelLock | null>((resolve, reject) => {
        const server = createServer((socket) => socket.destroy());
        server.once("error", (error: NodeJS.ErrnoException) => {
          if (error.code === "EADDRINUSE") resolve(null);
          else reject(error);
        });
        server.listen({ path: name }, () => {
          server.removeAllListeners("error");
          let released = false;
          resolve({
            release() {
              if (released) return Promise.resolve();
              released = true;
              return new Promise<void>((done) => server.close(() => done()));
            },
          });
        });
      });
    },
  };
}
