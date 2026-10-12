import { join } from "node:path/posix";
import { type AbsPath, absPath } from "../path-types.ts";
import { validateName } from "../paths/validate-name.ts";
import type { Platform } from "../platform.ts";
import { checkLength } from "./check-length.ts";
import { isCloudSynced, isInUserFolders, type LocationRules } from "./locations.ts";

// darwin 与 linux 共用的 paths：各系统只给出自己的上限和位置规则，其余相同。

export interface PosixPathsConfig {
  home: AbsPath;
  /** 开发版与正式版隔离（`RUNYARD_PROFILE=dev`）：数据目录是 `~/.runyard-dev` 和 `~/Runyard-dev` */
  profile: "dev" | undefined;
  maxPathBytes: number;
  caseInsensitive: boolean;
  cloudDirs: readonly string[];
  userFolders: readonly string[];
}

export function createPosixPaths(config: PosixPathsConfig): Platform["paths"] {
  const suffix = config.profile === "dev" ? "-dev" : "";
  const rules: LocationRules = config;
  return {
    home: config.home,
    stateDir: absPath(join(config.home, `.runyard${suffix}`)),
    defaultLibrary: absPath(join(config.home, `Runyard${suffix}`)),
    validateName,
    checkLength: (p) => checkLength(p, { maxBytes: config.maxPathBytes }),
    isCloudSynced: (p) => isCloudSynced(p, rules),
    isInUserFolders: (p) => isInUserFolders(p, rules),
  };
}
