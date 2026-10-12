import type { AbsPath, Env, Platform } from "@runyard/platform";
import type { RunClock } from "../run/run-clock.ts";

// 执行一条版本命令并收集输出。命令来自工具定义，经 platform.exec.spawn 执行（参数数组，不经 shell）。
// 只在“退出码为 0”时交出输出；超时、启动失败、非零退出一律返回 null，调用方据此判为没找到。

export const VERSION_COMMAND_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

const yieldLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export interface VersionCommandDeps {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly timeoutMs?: number;
}

export async function runVersionCommand(
  deps: VersionCommandDeps,
  spec: { argv: string[]; cwd: AbsPath; env: Env },
): Promise<string | null> {
  const timeoutMs = deps.timeoutMs ?? VERSION_COMMAND_TIMEOUT_MS;
  let proc: ReturnType<Platform["exec"]["spawn"]>;
  try {
    proc = deps.platform.exec.spawn({ ...spec, stdin: false });
  } catch {
    return null;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for (const stream of [proc.stdout, proc.stderr]) {
    stream.on("data", (chunk: Uint8Array | string) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
      if (size >= MAX_OUTPUT_BYTES) return;
      size += bytes.length;
      chunks.push(bytes);
    });
    stream.on("error", () => undefined);
  }

  let timer: number | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = deps.clock.setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const outcome = await Promise.race([proc.exited.catch(() => ({ exitCode: null })), timedOut]);
  if (timer !== undefined) deps.clock.clearTimeout(timer);

  if (outcome === "timeout") {
    // 版本命令卡住（例如垫片在联网）：结束它，不让它留在后台
    await deps.platform.proc
      .terminate(proc.ref, { mode: "kill", graceMs: 0 })
      .catch(() => undefined);
    proc.stdout.destroy();
    proc.stderr.destroy();
    return null;
  }
  await yieldLoop();
  await yieldLoop();
  proc.stdout.destroy();
  proc.stderr.destroy();
  if (outcome.exitCode !== 0) return null;
  return Buffer.concat(chunks).toString("utf8");
}
