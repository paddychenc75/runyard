import type { Platform } from "../platform.ts";
import type { PlatformOptions } from "../platform-options.ts";
import { composePosix } from "../posix/compose-posix.ts";

// macOS 的 PATH_MAX 是 1024
const MAX_PATH_BYTES = 1024;

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
  });
}
