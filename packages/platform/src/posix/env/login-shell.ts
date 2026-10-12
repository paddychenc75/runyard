import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { userInfo } from "node:os";
import { basename, isAbsolute } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type ShellKind = "zsh" | "bash" | "fish";

const FALLBACK_SHELL = "/bin/zsh";

/** 能解析环境的 shell 只有这三种；nu、tcsh、xonsh、sh 等不尝试，直接走回退（决策记录 0009） */
export function shellKindOf(shellPath: string): ShellKind | null {
  const name = basename(shellPath).replace(/^-/, "");
  return name === "zsh" || name === "bash" || name === "fish" ? name : null;
}

async function isExecutable(file: string): Promise<boolean> {
  if (!isAbsolute(file)) return false;
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `dscl . -read /Users/x UserShell` 的输出：`UserShell: /bin/zsh` */
export function parseDsclShell(output: string): string | undefined {
  return /UserShell:\s*(\S+)/.exec(output)?.[1];
}

/** `getent passwd x` 的输出：第七段是 shell */
export function parseGetentShell(output: string): string | undefined {
  const shell = output.trim().split(":")[6];
  return shell === undefined || shell === "" ? undefined : shell;
}

/** 用系统自带的命令向目录服务要用户的 shell（参数数组，不经 shell）；失败返回 undefined */
export function directoryShellLookup(
  command: string,
  argsFor: (user: string) => string[],
  parse: (output: string) => string | undefined,
): () => Promise<string | undefined> {
  return async () => {
    try {
      const { stdout } = await run(command, argsFor(userInfo().username), {
        encoding: "utf8",
        timeout: 3000,
      });
      return parse(stdout);
    } catch {
      return undefined;
    }
  };
}

export interface LoginShellSources {
  /** 调用方（或测试）直接指定，不再查别的 */
  override?: string;
  /** 默认 os.userInfo().shell */
  userInfoShell?: () => string | undefined;
  /** 目录服务（macOS 的 dscl、Linux 的 getent） */
  directory?: () => Promise<string | undefined>;
  /** 进程环境里的 SHELL：从 Finder 启动时可能缺失，所以排在最后 */
  envShell?: string;
}

function osUserShell(): string | undefined {
  try {
    return userInfo().shell ?? undefined;
  } catch {
    return undefined;
  }
}

/** 找用户的登录 shell。从 Finder 启动时没有 SHELL，所以先问系统，不依赖环境变量（决策记录 0009 的陷阱 1） */
export async function findLoginShell(sources: LoginShellSources): Promise<string> {
  if (sources.override !== undefined) return sources.override;
  const candidates: (() => Promise<string | undefined> | string | undefined)[] = [
    sources.userInfoShell ?? osUserShell,
    sources.directory ?? (() => undefined),
    () => sources.envShell,
  ];
  for (const candidate of candidates) {
    const shell = await candidate();
    if (shell !== undefined && (await isExecutable(shell))) return shell;
  }
  return FALLBACK_SHELL;
}
