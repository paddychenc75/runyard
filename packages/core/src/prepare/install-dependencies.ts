import { createHash } from "node:crypto";
import { type AbsPath, type Env, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import {
  classifySetupFailure,
  type LogEntry,
  type Runner,
  type SetupErrorReason,
} from "@runyard/protocol";
import type { RunClock } from "../run/run-clock.ts";
import { runCommand } from "../run/run-command.ts";

// 依赖安装（规格 RUN-LIFECYCLE-06、07；技术设计 §4.4 的 setup）。
// `inputs` 里的文件加上选中的包管理器一起算哈希，写进 `stamp`；哈希没变且 stamp 在就跳过。
// 命令来自运行器（已带 --prefer-offline 之类优先本机缓存的参数），失败按 `errors` 的正则归类，
// 都不匹配就是 SETUP_FAILED。

type Setup = NonNullable<Runner["setup"]>;

export type InstallInput = {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly setup: Setup;
  readonly folder: AbsPath;
  /** 选中的包管理器，`setup.variants` 的键 */
  readonly variant: string;
  /** 命令的第一个词已经换成真实路径 */
  readonly argv: readonly string[];
  readonly env: Env;
  readonly signal: AbortSignal;
  readonly onEntry: (entry: LogEntry) => void;
};

export type InstallOutcome =
  | { readonly status: "skipped" }
  | { readonly status: "installed" }
  | { readonly status: "aborted" }
  | {
      readonly status: "failed";
      readonly reason: SetupErrorReason;
      readonly exitCode: number | null;
      readonly outputTail: string;
    };

/** 输入文件的内容加包管理器的哈希。文件不存在和空文件是两回事 */
export async function hashInstallInputs(
  platform: Pick<Platform, "fs">,
  folder: AbsPath,
  inputs: readonly string[],
  variant: string,
): Promise<string> {
  const hash = createHash("sha256");
  hash.update(`variant\0${variant}\0`);
  for (const input of [...inputs].sort()) {
    const text = await platform.fs.readText(joinPath(folder, posixRelPath(input)));
    hash.update(`${input}\0${text === null ? "absent" : `present\0${text}`}\0`);
  }
  return hash.digest("hex");
}

const stampPath = (folder: AbsPath, stamp: string) => joinPath(folder, posixRelPath(stamp));

async function stampMatches(
  platform: Pick<Platform, "fs">,
  folder: AbsPath,
  setup: Setup,
  hash: string,
): Promise<boolean> {
  const text = await platform.fs.readText(stampPath(folder, setup.stamp));
  if (text === null) return false;
  try {
    return (JSON.parse(text) as { hash?: unknown }).hash === hash;
  } catch {
    return false; // 坏掉的 stamp 当作没有
  }
}

async function writeStamp(
  platform: Pick<Platform, "fs">,
  folder: AbsPath,
  setup: Setup,
  hash: string,
): Promise<void> {
  const parts = setup.stamp.split("/");
  if (parts.length > 1) {
    await platform.fs.makeDir(joinPath(folder, posixRelPath(parts.slice(0, -1).join("/"))));
  }
  await platform.fs.writeAtomic(stampPath(folder, setup.stamp), JSON.stringify({ hash }));
}

/** 没有哈希变化就不需要安装：调用方据此决定要不要先把状态推进到 installing */
export async function installIsCurrent(
  platform: Pick<Platform, "fs">,
  folder: AbsPath,
  setup: Setup,
  variant: string,
): Promise<boolean> {
  const hash = await hashInstallInputs(platform, folder, setup.inputs, variant);
  return stampMatches(platform, folder, setup, hash);
}

// pnpm 在没有终端时要确认清空 node_modules（来自别的包管理器、仓库位置或虚拟存储目录变了）：
// 它按 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY 退出并提示设 CI 或 confirmModulesPurge。
// 规格 TEMPLATES-RUNNERS-16 要求带下面的参数只重试一次，不设 CI（CI 会改变别的行为）。
// 这是 pnpm 专有的已知情况，不进运行器格式；第二次仍失败按原来的方式报告。
const PNPM_PURGE_NO_TTY = "ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY";
const PNPM_PURGE_RETRY_ARG = "--config.confirmModulesPurge=false";

async function runInstall(input: InstallInput, argv: readonly string[]) {
  input.onEntry({ at: input.clock.now(), kind: "command", text: argv.join(" ") });
  return runCommand({
    platform: input.platform,
    clock: input.clock,
    argv,
    cwd: input.folder,
    env: input.env,
    signal: input.signal,
    onEntry: input.onEntry,
  });
}

export async function installDependencies(input: InstallInput): Promise<InstallOutcome> {
  const { platform, setup, folder, variant } = input;
  // 哈希在安装之前算：安装期间 lock 文件被改写，下次就会因为哈希不同而再装一次，而不是漏装
  const hash = await hashInstallInputs(platform, folder, setup.inputs, variant);
  if (await stampMatches(platform, folder, setup, hash)) return { status: "skipped" };

  let result = await runInstall(input, input.argv);
  if (
    variant === "pnpm" &&
    !result.aborted &&
    result.exitCode !== 0 &&
    result.text.includes(PNPM_PURGE_NO_TTY)
  ) {
    result = await runInstall(input, [...input.argv, PNPM_PURGE_RETRY_ARG]);
  }
  if (result.aborted) return { status: "aborted" };
  if (result.exitCode === 0 && !result.spawnFailed) {
    await writeStamp(platform, folder, setup, hash);
    return { status: "installed" };
  }
  return {
    status: "failed",
    reason: classifySetupFailure(setup.errors, result.text),
    exitCode: result.exitCode,
    outputTail: result.tail,
  };
}
