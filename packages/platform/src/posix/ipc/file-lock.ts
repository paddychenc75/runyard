import { constants, promises as fs } from "node:fs";
import type { AbsPath } from "../../path-types.ts";
import type { LockStrategy } from "./kernel-lock.ts";

// macOS：打开时就带独占锁。O_EXLOCK 是 BSD 的标志（0x20），Node 的 fs.constants 没导出，直接传数值；
// 普通 Node 和 Electron 都实测可用（证据 0005 的“单实例”一节）。有 O_NONBLOCK，别人持有时立刻 EAGAIN。
// 锁跟着打开的文件描述符走：关掉它或进程死亡就释放。Node 默认不让子进程继承描述符，
// 所以管理进程的子进程不会替它占着锁。
const O_EXLOCK = 0x20;

export function fileLock(lockFile: AbsPath): LockStrategy {
  return {
    async acquire() {
      const flags = constants.O_RDWR | constants.O_CREAT | O_EXLOCK | constants.O_NONBLOCK;
      let handle: fs.FileHandle;
      try {
        handle = await fs.open(lockFile, flags, 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EAGAIN") return null;
        throw error;
      }
      let released = false;
      return {
        async release() {
          if (released) return;
          released = true;
          await handle.close();
        },
      };
    },
  };
}
