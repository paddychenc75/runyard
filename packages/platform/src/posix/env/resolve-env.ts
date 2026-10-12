import { randomBytes } from "node:crypto";
import type { AbsPath } from "../../path-types.ts";
import type { Env, EnvFailureReason } from "../../platform.ts";
import type { ShellKind } from "./login-shell.ts";
import { dropSessionVariables, parseEnvBlock } from "./parse-env-block.ts";
import { type CaptureDeps, type CaptureOutcome, captureBlock } from "./run-capture.ts";
import { type CaptureMode, captureScript, markersFor } from "./shell-script.ts";

// 向登录 shell 要一次环境（决策记录 0009 的依据文档“解析器算法”）。
// 依次尝试，前一个失败（不是超时）才试下一个；整条链共用一个 10 秒的硬期限，超时立刻放弃。

/** 硬超时 10 秒（规格 TOOLCHAIN-DETECTION-15）。测试可以传更短的值，生产代码用这个 */
export const ENV_RESOLVE_TIMEOUT_MS = 10_000;

export type ShellEnvSource = "login-shell" | "login-shell-degraded" | "path-only";

export type ShellResolution =
  | { readonly ok: true; readonly env: Record<string, string>; readonly source: ShellEnvSource }
  | { readonly ok: false; readonly reason: EnvFailureReason };

export interface ResolveInput {
  readonly shell: string;
  readonly kind: ShellKind;
  /** 本进程的环境（加上主目录） */
  readonly base: Env;
  /** 项目有版本文件时是项目文件夹，否则是主目录 */
  readonly cwd: AbsPath;
  readonly timeoutMs: number;
}

export interface ResolveDeps extends CaptureDeps {
  readonly now: () => number;
  readonly nonce: () => string;
}

export function defaultNonce(): string {
  return randomBytes(8).toString("hex");
}

interface Attempt {
  readonly source: ShellEnvSource;
  readonly mode: CaptureMode;
  /** 有这个字段：命令写进 stdin（穿过启动文件里 exec 另一个 shell 的情况） */
  readonly viaStdin: boolean;
  readonly interactive: boolean;
}

const ATTEMPTS: readonly Attempt[] = [
  { source: "login-shell", mode: "env", viaStdin: false, interactive: true },
  { source: "login-shell", mode: "env", viaStdin: true, interactive: true },
  { source: "path-only", mode: "path", viaStdin: false, interactive: true },
  // 不加 -i 读不到 .zshrc，结果只能标为降级
  { source: "login-shell-degraded", mode: "env", viaStdin: false, interactive: false },
];

function toResolution(
  attempt: Attempt,
  outcome: CaptureOutcome,
  base: Env,
): ShellResolution | null {
  if (outcome.kind !== "block") return null;
  const { env } = parseEnvBlock(outcome.block);
  if (attempt.mode === "path") {
    // 内建只打印了 PATH；其余沿用本进程的环境
    const path = env.PATH;
    return path === undefined || path === ""
      ? null
      : { ok: true, source: attempt.source, env: dropSessionVariables({ ...base, PATH: path }) };
  }
  // 既没有 PATH 也没有 HOME：标记齐全但环境是空的（env 无法执行时），视为失败
  if (env.PATH === undefined && env.HOME === undefined) return null;
  return { ok: true, source: attempt.source, env: dropSessionVariables(env) };
}

export async function resolveShellEnv(
  deps: ResolveDeps,
  input: ResolveInput,
): Promise<ShellResolution> {
  const deadline = deps.now() + input.timeoutMs;
  const env = { ...input.base, RUNYARD_RESOLVING_ENV: "1" };
  for (const attempt of ATTEMPTS) {
    const remaining = deadline - deps.now();
    if (remaining <= 0) return { ok: false, reason: "timeout" };
    const markers = markersFor(deps.nonce());
    const script = captureScript(input.kind, markers, attempt.mode);
    const flags = attempt.interactive ? ["-l", "-i"] : ["-l"];
    const outcome = await captureBlock(deps, {
      argv: attempt.viaStdin ? [input.shell, ...flags] : [input.shell, ...flags, "-c", script],
      cwd: input.cwd,
      env,
      ...(attempt.viaStdin ? { stdin: `${script}\nexit\n` } : {}),
      start: markers.start,
      end: markers.end,
      timeoutMs: remaining,
    });
    if (outcome.kind === "timeout") return { ok: false, reason: "timeout" };
    const resolution = toResolution(attempt, outcome, input.base);
    if (resolution !== null) return resolution;
  }
  return { ok: false, reason: "failed" };
}
