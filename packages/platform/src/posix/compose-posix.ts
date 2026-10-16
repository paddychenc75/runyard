import { release } from "node:os";
import type { AbsPath } from "../path-types.ts";
import type { Arch, Env, Platform, PlatformId } from "../platform.ts";
import type { LoginShellSources } from "./env/login-shell.ts";
import { createPosixToolchain } from "./env/posix-toolchain.ts";
import { createPosixFs } from "./fs/posix-fs.ts";
import { watchPosix } from "./fs/posix-watch.ts";
import { createPosixIpc, type PosixIpcConfig } from "./ipc/create-posix-ipc.ts";
import { pendingCli, pendingDesktop } from "./pending-areas.ts";
import { createPosixExec } from "./posix-exec.ts";
import { createPosixPaths, type PosixPathsConfig } from "./posix-paths.ts";
import { createPosixPorts } from "./posix-ports.ts";
import { createPosixProc } from "./posix-proc.ts";
import type { ProcessSource } from "./process-source.ts";
import type { SocketTable } from "./socket-table.ts";
import { createSpawnDetached } from "./spawn-detached.ts";

// darwin 与 linux 的共同底座：把共用部分组合成一个 Platform。
// 各块的真实现落在 posix/ 里，随 #26 逐块替换占位（exec.which、exec.spawn、proc、ports 已在 #25 完成，fs 与 watch 在 #28）；系统专属的覆盖在 darwin/、linux/ 里写。

export interface PosixConfig {
  id: Extract<PlatformId, "darwin" | "linux">;
  arch: Arch;
  caps: Platform["caps"];
  paths: PosixPathsConfig;
  ipc: Pick<PosixIpcConfig, "maxSocketPathBytes" | "lock">;
  /** 进程表和连接表怎么读：各系统不同，算法在 posix/ 里共用 */
  processes: ProcessSource;
  sockets: SocketTable;
  /** 登录环境怎么解析：本进程的环境、可选的指定 shell、向目录服务要 shell 的办法（各系统不同） */
  toolchain: {
    baseEnv: Env;
    shellHome?: AbsPath;
    loginShell?: string;
    directory: LoginShellSources["directory"];
  };
  /** 废纸篓是各系统自己的事：darwin 有实现，linux 抛 NOT_SUPPORTED */
  trash: Platform["fs"]["trash"];
}

export function composePosix(config: PosixConfig): Platform {
  const paths = createPosixPaths(config.paths);
  const exec = createPosixExec(config.processes);
  const proc = createPosixProc({ source: config.processes });
  const { loginShell, directory, baseEnv } = config.toolchain;
  const toolchain = createPosixToolchain({
    home: config.toolchain.shellHome ?? paths.home,
    baseEnv,
    loginShell: {
      ...(loginShell === undefined ? {} : { override: loginShell }),
      ...(directory === undefined ? {} : { directory }),
    },
    deps: { exec, proc },
  });
  return {
    id: config.id,
    arch: config.arch,
    caps: config.caps,
    paths,
    env: toolchain.env,
    exec: {
      ...exec,
      spawnDetached: createSpawnDetached(paths.stateDir),
    },
    proc,
    ports: createPosixPorts({ table: config.sockets }),
    fs: { ...createPosixFs(), trash: config.trash },
    watch: watchPosix,
    ipc: createPosixIpc({ stateDir: paths.stateDir, ...config.ipc }),
    tools: toolchain.tools,
    system: { release },
    shell: toolchain.shell,
    desktop: pendingDesktop,
    cli: pendingCli,
  };
}
