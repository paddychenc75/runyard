import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { type AbsPath, absPath } from "../../path-types.ts";
import type { Env, EnvLoadResult, Platform, ShellInfo, ToolCandidate } from "../../platform.ts";
import { knownToolDirs, pathDirs, scanFallbackEnv } from "./common-dirs.ts";
import { type CacheTarget, EnvCache } from "./env-cache.ts";
import { projectFingerprint, startupFingerprint } from "./env-fingerprint.ts";
import { findLoginShell, type LoginShellSources, shellKindOf } from "./login-shell.ts";
import {
  defaultNonce,
  ENV_RESOLVE_TIMEOUT_MS,
  type ResolveDeps,
  resolveShellEnv,
} from "./resolve-env.ts";
import type { CaptureDeps } from "./run-capture.ts";

// env、tools、shell 三块的 POSIX 实现（issue #26，决策记录 0009）。darwin 与 linux 共用，
// 区别只有“怎样向目录服务要用户的 shell”（LoginShellSources.directory）。

/** 运行时关闭 uv 和 Go 的自动下载（规格 TOOLCHAIN-DETECTION-03） */
export const RUN_DEFAULTS: Readonly<Record<string, string>> = {
  UV_PYTHON_DOWNLOADS: "never",
  GOTOOLCHAIN: "local",
};

const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"];

export interface ToolchainConfig {
  readonly home: AbsPath;
  /** 本进程的环境（子进程继承它，HOME 以 home 为准） */
  readonly baseEnv: Env;
  readonly loginShell: LoginShellSources;
  readonly deps: CaptureDeps;
  /** 以下三项只有测试会改 */
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly nonce?: () => string;
}

async function isExecutableFile(file: string): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function readShellsFile(): Promise<string[]> {
  try {
    return (await readFile("/etc/shells", "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("/"));
  } catch {
    return [];
  }
}

export function createPosixToolchain(
  config: ToolchainConfig,
): Pick<Platform, "env" | "tools" | "shell"> {
  const now = config.now ?? Date.now;
  const timeoutMs = config.timeoutMs ?? ENV_RESOLVE_TIMEOUT_MS;
  const resolveDeps: ResolveDeps = {
    ...config.deps,
    now,
    nonce: config.nonce ?? defaultNonce,
  };
  const childBase: Env = { ...config.baseEnv, HOME: config.home };

  const loginShell = () => findLoginShell({ envShell: config.baseEnv.SHELL, ...config.loginShell });

  // 解析一个目标：不能解析的 shell 不尝试，直接扫常见目录；失败或超时也退到扫描，并带上原因
  async function resolve(target: CacheTarget): Promise<EnvLoadResult> {
    const started = performance.now();
    const shell = await loginShell();
    const kind = shellKindOf(shell);
    const elapsed = () => Math.round(performance.now() - started);
    if (kind !== null) {
      const result = await resolveShellEnv(resolveDeps, {
        shell,
        kind,
        base: childBase,
        cwd: absPath(target.capture.cwd),
        timeoutMs,
      });
      if (result.ok) return { env: result.env, source: result.source, ms: elapsed() };
      const env = await scanFallbackEnv(childBase, config.home);
      return { env, source: "fallback", ms: elapsed(), reason: result.reason };
    }
    const env = await scanFallbackEnv(childBase, config.home);
    return { env, source: "fallback", ms: elapsed(), reason: "failed" };
  }

  const cache = new EnvCache({ now, resolve });

  // 有版本文件的项目：键加上项目路径和文件 mtime，并以项目文件夹为工作目录捕获；
  // 没有版本文件的项目共用全局缓存（工作目录用主目录）
  async function targetFor(cwd: AbsPath | undefined): Promise<CacheTarget> {
    const shell = await loginShell();
    const kind = shellKindOf(shell);
    const startup =
      kind === null
        ? `${shell}|unsupported`
        : await startupFingerprint(shell, kind, config.home, childBase);
    const project = cwd === undefined ? null : await projectFingerprint(cwd);
    return {
      key: project === null ? startup : `${startup}#${project}`,
      capture: { cwd: project === null || cwd === undefined ? config.home : cwd },
    };
  }

  const env: Platform["env"] = {
    async load(opts) {
      return cache.load(await targetFor(opts?.cwd), opts?.refresh === true);
    },
    runDefaults: () => ({ ...RUN_DEFAULTS }),
  };

  // PATH 里的目录排在前面；固定的常见位置只补 PATH 里没有的目录（origin 不同）
  async function findIn(dirs: string[], tool: string): Promise<AbsPath[]> {
    const files = dirs.map((dir) => join(dir, tool));
    const ok = await Promise.all(files.map((file) => isExecutableFile(file)));
    return files.filter((_, i) => ok[i]).map((file) => absPath(file));
  }

  const tools: Platform["tools"] = {
    async candidates(tool, environment) {
      if (tool === "" || tool.includes("/")) return [];
      const onPath = [...new Set(pathDirs(environment))];
      const known = (await knownToolDirs(config.home)).filter((dir) => !onPath.includes(dir));
      const found: ToolCandidate[] = [];
      for (const path of await findIn(onPath, tool)) found.push({ path, origin: "env-path" });
      for (const path of await findIn(known, tool)) found.push({ path, origin: "known-location" });
      return found;
    },
    // 用解析出的登录环境（缓存命中时不起进程）找包管理器，按偏好顺序（pnpm 在前，npm 作回退）
    async packageManagers() {
      const { env: resolved } = await env.load();
      const dirs = [...pathDirs(resolved), ...(await knownToolDirs(config.home))];
      const present = await Promise.all(
        PACKAGE_MANAGERS.map(async (name) => (await findIn(dirs, name)).length > 0),
      );
      return PACKAGE_MANAGERS.filter((_, i) => present[i]);
    },
  };

  // 集成终端用（M3 才有人调用）：登录 shell 第一个，其后是 /etc/shells 里装了的
  const shell: Platform["shell"] = {
    async interactive(environment) {
      const candidates = [
        await findLoginShell({ envShell: environment.SHELL, ...config.loginShell }),
        ...(await readShellsFile()),
      ];
      const seen = new Set<string>();
      const result: ShellInfo[] = [];
      for (const path of candidates) {
        if (seen.has(path) || !(await isExecutableFile(path))) continue;
        if (basename(path) === "nologin" || basename(path) === "false") continue;
        seen.add(path);
        result.push({ path: absPath(path), name: basename(path) });
      }
      return result;
    },
  };

  return { env, tools, shell };
}
