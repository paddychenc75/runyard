import type { AbsPath, Env, Platform } from "@runyard/platform";
import { absPath } from "@runyard/platform";
import type { ToolDefinition } from "@runyard/protocol";
import type { RunClock } from "../run/run-clock.ts";
import { runVersionCommand } from "./run-version-command.ts";
import { parseVersionNumbers } from "./version-compare.ts";

// 找一个工具（规格 TOOLCHAIN-DETECTION-04、05、06、11）。
// 候选的顺序：手动指定的路径 → 登录环境 PATH 上的 → 常见安装目录（只在没能读到登录环境时才用，
// 规格 -20：扫描只是解析失败时的临时答案）。每个候选都要执行版本命令并解析出版本号才算找到；
// 文件在但命令失败或解析不出版本号的，换下一个候选，都不行就是没找到。

export type ToolProbe =
  | {
      readonly tool: string;
      readonly state: "found";
      readonly path: string;
      readonly version: string;
    }
  | { readonly tool: string; readonly state: "missing" };

export interface DetectDeps {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly versionTimeoutMs?: number;
}

export interface DetectContext {
  /** 版本命令的工作目录：项目文件夹，版本垫片按它选版本 */
  readonly cwd: AbsPath;
  /** 登录环境（已合并 runDefaults，免得 go version 触发工具链下载） */
  readonly env: Env;
  readonly useKnownLocations: boolean;
  /** 设置里手动指定的路径 */
  readonly manualPath?: string;
}

function isManualPathUsable(path: string): boolean {
  try {
    absPath(path);
    return true;
  } catch {
    return false;
  }
}

async function candidatePaths(
  platform: Platform,
  definition: ToolDefinition,
  context: DetectContext,
): Promise<string[]> {
  const paths: string[] = [];
  // 手动路径不是绝对路径时当作无效，不抛错也不拿相对路径去执行
  if (context.manualPath !== undefined && isManualPathUsable(context.manualPath)) {
    paths.push(context.manualPath);
  }
  const names = definition.executables ?? [definition.id];
  for (const name of names) {
    for (const candidate of await platform.tools.candidates(name, context.env)) {
      if (candidate.origin === "known-location" && !context.useKnownLocations) continue;
      paths.push(candidate.path);
    }
  }
  return [...new Set(paths)];
}

export function extractVersion(definition: ToolDefinition, output: string): string | null {
  let pattern: RegExp;
  try {
    pattern = new RegExp(definition.detect.pattern);
  } catch {
    return null;
  }
  const version = pattern.exec(output)?.[1];
  if (version === undefined || parseVersionNumbers(version) === null) return null;
  return version;
}

export async function detectTool(
  deps: DetectDeps,
  definition: ToolDefinition,
  context: DetectContext,
): Promise<ToolProbe> {
  for (const path of await candidatePaths(deps.platform, definition, context)) {
    const output = await runVersionCommand(
      { ...deps, timeoutMs: deps.versionTimeoutMs },
      { argv: [path, ...definition.detect.args], cwd: context.cwd, env: context.env },
    );
    if (output === null) continue;
    const version = extractVersion(definition, output);
    if (version !== null) return { tool: definition.id, state: "found", path, version };
  }
  return { tool: definition.id, state: "missing" };
}
