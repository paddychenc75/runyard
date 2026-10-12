import type { Platform } from "../platform.ts";
import type { PlatformOptions } from "../platform-options.ts";
import { composePosix } from "../posix/compose-posix.ts";
import { abstractSocketLock } from "../posix/ipc/abstract-socket-lock.ts";
import { unsupported } from "../posix/pending-members.ts";

// Linux 的 PATH_MAX 是 4096
const MAX_PATH_BYTES = 4096;
// socket 路径上限：sun_path 在 Linux 上是 108 字节
const MAX_SOCKET_PATH_BYTES = 108;
const SYSTEM = "linux";

// 薄实现（决策记录 0013）：只组合 posix/ 的共用部分，让接口至少被第二个系统检验。
// Linux 不是第一版支持的系统：fs.trash、desktop、cli.installShim 抛 NOT_SUPPORTED。
export function createLinuxPlatform(options: PlatformOptions): Platform {
  const base = composePosix({
    id: "linux",
    arch: options.arch,
    caps: { gracefulStop: "graceful", cloneCopy: true, symlinks: true, sandbox: false },
    paths: {
      home: options.home,
      profile: options.profile,
      maxPathBytes: MAX_PATH_BYTES,
      caseInsensitive: false,
      cloudDirs: ["Dropbox", "Google Drive", "Box", "OneDrive*"],
      userFolders: ["Desktop", "Documents", "Downloads"],
    },
    // Linux：抽象命名空间 socket 作锁，与锁文件无关
    ipc: {
      maxSocketPathBytes: MAX_SOCKET_PATH_BYTES,
      lock: (locations) => abstractSocketLock(locations.runDir),
    },
  });
  return {
    ...base,
    fs: { ...base.fs, trash: () => unsupported("fs.trash", SYSTEM) },
    desktop: {
      reveal: () => unsupported("desktop.reveal", SYSTEM),
      openTerminalAt: () => unsupported("desktop.openTerminalAt", SYSTEM),
      openInEditor: () => unsupported("desktop.openInEditor", SYSTEM),
    },
    cli: { installShim: () => unsupported("cli.installShim", SYSTEM) },
  };
}
