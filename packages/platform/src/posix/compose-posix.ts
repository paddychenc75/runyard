import type { Arch, Platform, PlatformId } from "../platform.ts";
import {
  pendingCli,
  pendingDesktop,
  pendingEnv,
  pendingFs,
  pendingIpc,
  pendingShell,
  pendingSpawnDetached,
  pendingTools,
  pendingWatch,
} from "./pending-areas.ts";
import { createPosixExec } from "./posix-exec.ts";
import { createPosixPaths, type PosixPathsConfig } from "./posix-paths.ts";
import { createPosixPorts } from "./posix-ports.ts";
import { createPosixProc } from "./posix-proc.ts";
import type { ProcessSource } from "./process-source.ts";
import type { SocketTable } from "./socket-table.ts";

// darwin 与 linux 的共同底座：把共用部分组合成一个 Platform。
// 各块的真实现落在 posix/ 里，随 #26 到 #28 逐块替换占位（exec.which、exec.spawn、proc、ports 已在 #25 完成）；系统专属的覆盖在 darwin/、linux/ 里写。

export interface PosixConfig {
  id: Extract<PlatformId, "darwin" | "linux">;
  arch: Arch;
  caps: Platform["caps"];
  paths: PosixPathsConfig;
  /** 进程表和连接表怎么读：各系统不同，算法在 posix/ 里共用 */
  processes: ProcessSource;
  sockets: SocketTable;
}

export function composePosix(config: PosixConfig): Platform {
  return {
    id: config.id,
    arch: config.arch,
    caps: config.caps,
    paths: createPosixPaths(config.paths),
    env: pendingEnv,
    exec: { ...createPosixExec(config.processes), spawnDetached: pendingSpawnDetached },
    proc: createPosixProc({ source: config.processes }),
    ports: createPosixPorts({ table: config.sockets }),
    fs: pendingFs,
    watch: pendingWatch,
    ipc: pendingIpc,
    tools: pendingTools,
    shell: pendingShell,
    desktop: pendingDesktop,
    cli: pendingCli,
  };
}
