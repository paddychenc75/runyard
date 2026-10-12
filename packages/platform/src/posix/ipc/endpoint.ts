import { join } from "node:path/posix";
import { type AbsPath, absPath } from "../../path-types.ts";
import { platformError } from "../../platform-error.ts";

// 连接点和锁文件的位置（技术设计 §4.2、§5.1）。目录只有本人可访问，所以路径不含用户标识。
// 开发版与正式版的状态目录不同（~/.runyard-dev），连接点自然不同。

export interface IpcLocations {
  readonly runDir: AbsPath;
  readonly socket: AbsPath;
  readonly lockFile: AbsPath;
}

export function ipcLocations(stateDir: AbsPath): IpcLocations {
  const runDir = join(stateDir, "run");
  return {
    runDir: absPath(runDir),
    socket: absPath(join(runDir, "supervisor.sock")),
    lockFile: absPath(join(runDir, "supervisor.lock")),
  };
}

// socket 路径的字节上限由系统给：macOS 104，Linux 108（K1 实测，超了 bind 报 EINVAL）。
// 提前报明确的错误，别让用户看到一个 EINVAL
export function checkedSocketPath(locations: IpcLocations, maxBytes: number): string {
  const bytes = Buffer.byteLength(locations.socket);
  if (bytes > maxBytes) {
    throw platformError(
      "PATH_TOO_LONG",
      { name: locations.socket },
      `socket path is ${bytes} bytes, the limit is ${maxBytes}`,
    );
  }
  return locations.socket;
}
