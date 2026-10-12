import { connect } from "node:net";
import type { AbsPath } from "../../path-types.ts";
import type { Platform } from "../../platform.ts";
import { connectWithTimeout } from "./connect-with-timeout.ts";
import { checkedSocketPath, ipcLocations } from "./endpoint.ts";
import { computeProof, verifyProof } from "./handshake-proof.ts";
import type { LockStrategy } from "./kernel-lock.ts";
import { listenWithLock } from "./listen-with-lock.ts";

// darwin 与 linux 共用的 ipc：连接点是状态目录下的 socket，两个系统只在“锁怎么拿”和路径上限上不同。
export interface PosixIpcConfig {
  stateDir: AbsPath;
  /** socket 路径的字节上限：macOS 104，Linux 108 */
  maxSocketPathBytes: number;
  /** 由 lockFile 得出：macOS 是文件锁，Linux 是抽象 socket（与文件无关） */
  lock(locations: ReturnType<typeof ipcLocations>): LockStrategy;
}

export function createPosixIpc(config: PosixIpcConfig): Platform["ipc"] {
  const locations = ipcLocations(config.stateDir);
  const endpoint = () => checkedSocketPath(locations, config.maxSocketPathBytes);
  return {
    endpoint,
    listen: async () => listenWithLock(locations, config.lock(locations), endpoint()),
    connect: async (timeoutMs) => {
      const path = endpoint();
      return connectWithTimeout(() => connect({ path }), timeoutMs, path);
    },
    computeProof,
    verifyProof,
  };
}
