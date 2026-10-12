import type { Platform } from "../platform.ts";
import type { PlatformOptions } from "../platform-options.ts";
import { composePosix } from "../posix/compose-posix.ts";
import { fileLock } from "../posix/ipc/file-lock.ts";

// macOS 的 PATH_MAX 是 1024
const MAX_PATH_BYTES = 1024;
// socket 路径上限：sun_path 在 macOS 上是 104 字节（K1 实测 104 可以，107 起 EINVAL）
const MAX_SOCKET_PATH_BYTES = 104;

export function createDarwinPlatform(options: PlatformOptions): Platform {
  return composePosix({
    id: "darwin",
    arch: options.arch,
    // APFS 支持 clonefile；打包的应用不开沙箱
    caps: { gracefulStop: "graceful", cloneCopy: true, symlinks: true, sandbox: false },
    paths: {
      home: options.home,
      profile: options.profile,
      maxPathBytes: MAX_PATH_BYTES,
      // 默认卷不分大小写
      caseInsensitive: true,
      cloudDirs: [
        "Library/Mobile Documents", // iCloud 云盘
        "Library/CloudStorage", // Dropbox、OneDrive、Google Drive 等文件提供程序
        "Dropbox",
        "Google Drive",
        "Box",
        "Box Sync",
        "OneDrive*",
      ],
      userFolders: ["Desktop", "Documents", "Downloads"],
    },
    // macOS：run/supervisor.lock 上的内核文件锁
    ipc: {
      maxSocketPathBytes: MAX_SOCKET_PATH_BYTES,
      lock: (locations) => fileLock(locations.lockFile),
    },
  });
}
