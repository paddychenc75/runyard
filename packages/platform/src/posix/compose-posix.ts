import type { Arch, Platform, PlatformId } from "../platform.ts";
import { createPosixIpc, type PosixIpcConfig } from "./ipc/create-posix-ipc.ts";
import {
  pendingCli,
  pendingDesktop,
  pendingEnv,
  pendingExec,
  pendingFs,
  pendingPorts,
  pendingProc,
  pendingShell,
  pendingTools,
  pendingWatch,
} from "./pending-areas.ts";
import { createPosixPaths, type PosixPathsConfig } from "./posix-paths.ts";
import { createSpawnDetached } from "./spawn-detached.ts";

// darwin 与 linux 的共同底座：把共用部分组合成一个 Platform。
// 各块的真实现落在 posix/ 里，随 #25、#26、#28 逐块替换占位；系统专属的覆盖在 darwin/、linux/ 里写。

export interface PosixConfig {
  id: Extract<PlatformId, "darwin" | "linux">;
  arch: Arch;
  caps: Platform["caps"];
  paths: PosixPathsConfig;
  ipc: Pick<PosixIpcConfig, "maxSocketPathBytes" | "lock">;
}

export function composePosix(config: PosixConfig): Platform {
  const paths = createPosixPaths(config.paths);
  return {
    id: config.id,
    arch: config.arch,
    caps: config.caps,
    paths,
    env: pendingEnv,
    exec: { ...pendingExec, spawnDetached: createSpawnDetached(paths.stateDir) },
    proc: pendingProc,
    ports: pendingPorts,
    fs: pendingFs,
    watch: pendingWatch,
    ipc: createPosixIpc({ stateDir: paths.stateDir, ...config.ipc }),
    tools: pendingTools,
    shell: pendingShell,
    desktop: pendingDesktop,
    cli: pendingCli,
  };
}
