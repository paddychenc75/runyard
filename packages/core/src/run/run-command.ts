import type { AbsPath, Env, Platform } from "@runyard/platform";
import type { LogEntry } from "@runyard/protocol";
import { cleanLogText } from "../logs/clean-log-text.ts";
import type { RunClock } from "./run-clock.ts";
import { pumpOutput } from "./run-output.ts";

// 跑一条辅助命令（安装依赖、脚本语法检查）并收集输出。
// 命令是参数数组，经 platform.exec.spawn，不经 shell。输出一边逐条交给 onEntry（进同一份日志），
// 一边攒成清洗后的全文（上限 MAX_TEXT_CHARS，只留开头够用的部分）和末尾几行，供归类与 cause.outputTail 用。

const MAX_TEXT_CHARS = 256 * 1024;

export type CommandOutcome = {
  /** 进程退出码；没起来、被超时或中止结束时为 null */
  readonly exitCode: number | null;
  readonly spawnFailed: boolean;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  /** 清洗后的全部输出（有上限），用来按特征归类 */
  readonly text: string;
  /** 清洗后的末尾几行 */
  readonly tail: string;
};

export type CommandSpec = {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly argv: readonly string[];
  readonly cwd: AbsPath;
  readonly env: Env;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onEntry?: (entry: LogEntry) => void;
};

export async function runCommand(spec: CommandSpec): Promise<CommandOutcome> {
  const { platform, clock } = spec;
  const none = { exitCode: null, timedOut: false, aborted: false, text: "", tail: "" };
  if (spec.signal?.aborted === true) return { ...none, spawnFailed: false, aborted: true };
  let proc: ReturnType<Platform["exec"]["spawn"]>;
  try {
    proc = platform.exec.spawn({
      argv: [...spec.argv],
      cwd: spec.cwd,
      env: spec.env,
      stdin: false,
    });
  } catch {
    return { ...none, spawnFailed: true };
  }

  let text = "";
  const output = pumpOutput(proc, {
    now: () => clock.now(),
    emit: (entry) => {
      spec.onEntry?.(entry);
      if (entry.kind !== "stdout" && entry.kind !== "stderr") return;
      const cleaned = cleanLogText(entry.text);
      if (cleaned !== null && text.length < MAX_TEXT_CHARS) text += `${cleaned}\n`;
    },
  });

  let timer: number | undefined;
  let why: "timeout" | "abort" | undefined;
  const interrupted = new Promise<void>((resolve) => {
    const stop = (reason: "timeout" | "abort") => {
      why = reason;
      resolve();
    };
    if (spec.timeoutMs !== undefined)
      timer = clock.setTimeout(() => stop("timeout"), spec.timeoutMs);
    spec.signal?.addEventListener("abort", () => stop("abort"), { once: true });
  });
  const exited = proc.exited.catch(() => ({ exitCode: null }));
  const winner = await Promise.race([exited, interrupted.then(() => undefined)]);
  if (timer !== undefined) clock.clearTimeout(timer);

  let exitCode: number | null = winner === undefined ? null : winner.exitCode;
  if (winner === undefined) {
    // 超时或被中止：整棵结束；中止给礼貌请求的机会，超时直接强制
    await platform.proc
      .terminate(proc.ref, { mode: why === "abort" ? "graceful" : "kill", graceMs: 2000 })
      .catch(() => undefined);
    exitCode = (await exited).exitCode;
  }
  await output.finish();
  return {
    exitCode,
    spawnFailed: false,
    timedOut: why === "timeout",
    aborted: why === "abort",
    text,
    tail: output.tail(),
  };
}
