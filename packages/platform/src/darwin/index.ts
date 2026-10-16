import { userInfo } from "node:os";
import type { Platform } from "../platform.ts";
import type { PlatformOptions } from "../platform-options.ts";
import { composePosix } from "../posix/compose-posix.ts";
import { directoryShellLookup, parseDsclShell } from "../posix/env/login-shell.ts";
import { fileLock } from "../posix/ipc/file-lock.ts";
import { createNetstatTable } from "./netstat-table.ts";
import { createPsSource } from "./ps-source.ts";
import { createDarwinTrash } from "./trash/darwin-trash.ts";
import { SYSTEM_TRASH_TOOL } from "./trash/system-trash-tool.ts";

// macOS 的 PATH_MAX 是 1024
const MAX_PATH_BYTES = 1024;
// socket 路径上限：sun_path 在 macOS 上是 104 字节（K1 实测 104 可以，107 起 EINVAL）
const MAX_SOCKET_PATH_BYTES = 104;

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function createDarwinPlatform(options: PlatformOptions): Platform {
  // 系统的 trash 命令只会进当前账号真实的废纸篓：平台指向别的主目录（测试的临时主目录）时不用它，
  // 免得测试往用户真实的废纸篓里放东西
  const accountHome = userInfo().homedir;
  const uid = userInfo().uid;
  return composePosix({
    id: "darwin",
    trash: createDarwinTrash({
      home: options.home,
      uid,
      now: () => new Date(),
      systemTool: options.home === accountHome ? SYSTEM_TRASH_TOOL : null,
    }),
    arch: options.arch,
    // APFS 支持 clonefile；打包的应用不开沙箱
    caps: { gracefulStop: "graceful", cloneCopy: true, symlinks: true, sandbox: false },
    processes: createPsSource(),
    sockets: createNetstatTable(),
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
    // 登录 shell：先问系统（os.userInfo），再问目录服务 dscl；从 Finder 启动时 SHELL 可能不存在
    toolchain: {
      baseEnv: options.baseEnv ?? stringEnv(process.env),
      ...(options.shellHome === undefined ? {} : { shellHome: options.shellHome }),
      ...(options.loginShell === undefined ? {} : { loginShell: options.loginShell }),
      directory: directoryShellLookup(
        "dscl",
        (user) => [".", "-read", `/Users/${user}`, "UserShell"],
        parseDsclShell,
      ),
    },
    // macOS：run/supervisor.lock 上的内核文件锁
    ipc: {
      maxSocketPathBytes: MAX_SOCKET_PATH_BYTES,
      lock: (locations) => fileLock(locations.lockFile),
    },
  });
}
