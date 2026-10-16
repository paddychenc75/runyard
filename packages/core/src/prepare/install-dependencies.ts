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

export async function installDependencies(input: InstallInput): Promise<InstallOutcome> {
  const { platform, setup, folder, variant } = input;
  // 哈希在安装之前算：安装期间 lock 文件被改写，下次就会因为哈希不同而再装一次，而不是漏装
  const hash = await hashInstallInputs(platform, folder, setup.inputs, variant);
  if (await stampMatches(platform, folder, setup, hash)) return { status: "skipped" };

  input.onEntry({ at: input.clock.now(), kind: "command", text: input.argv.join(" ") });
  const result = await runCommand({
    platform,
    clock: input.clock,
    argv: input.argv,
    cwd: folder,
    env: input.env,
    signal: input.signal,
    onEntry: input.onEntry,
  });
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
