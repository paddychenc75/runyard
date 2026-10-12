import type { AbsPath } from "../../path-types.ts";
import type { Env, Platform } from "../../platform.ts";
import { findBlock } from "./parse-env-block.ts";

// 起一个登录 shell 并读出标记之间的字节。
// 自成进程组、stdin 要么是空（/dev/null）要么由我们写入；看到结束标记就杀整组，不等管道关闭
// （后台任务可能一直占着管道）；超时同样杀整组。杀进程经 proc.terminate，每次核对身份。

export type CaptureOutcome =
  | { readonly kind: "block"; readonly block: Buffer }
  | { readonly kind: "failed" }
  | { readonly kind: "timeout" };

export interface CaptureSpec {
  readonly argv: string[];
  readonly cwd: AbsPath;
  readonly env: Env;
  /** 要写进 stdin 的命令；没有就是空输入 */
  readonly stdin?: string;
  readonly start: string;
  readonly end: string;
  readonly timeoutMs: number;
}

export interface CaptureDeps {
  readonly exec: Pick<Platform["exec"], "spawn">;
  readonly proc: Pick<Platform["proc"], "terminate">;
}

/** 输出超过这个量就放弃（防止一个失控的启动文件把内存吃光） */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
/** 进程退出后再等一会儿，让管道里剩下的数据读完；后台任务占着管道时不会等到 end，所以要有上限 */
const EXIT_DRAIN_MS = 250;

export function captureBlock(deps: CaptureDeps, spec: CaptureSpec): Promise<CaptureOutcome> {
  const [command, ...rest] = spec.argv;
  if (command === undefined) return Promise.resolve({ kind: "failed" });
  let child: ReturnType<CaptureDeps["exec"]["spawn"]>;
  try {
    child = deps.exec.spawn({
      argv: [command, ...rest],
      cwd: spec.cwd,
      env: spec.env,
      stdin: spec.stdin !== undefined,
    });
  } catch {
    return Promise.resolve({ kind: "failed" });
  }
  const proc = child;

  return new Promise((resolve) => {
    let settled = false;
    let output = Buffer.alloc(0);
    let drainTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: CaptureOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(drainTimer);
      // 不管成功失败都收这一组：成功时 shell 还活着，失败时可能留着后台任务
      deps.proc
        .terminate(proc.ref, { mode: "kill", graceMs: 0 })
        .catch(() => {})
        .then(() => resolve(outcome));
    };

    const deadline = setTimeout(() => finish({ kind: "timeout" }), spec.timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      output = Buffer.concat([output, chunk]);
      const block = findBlock(output, spec.start, spec.end);
      if (block !== null) return finish({ kind: "block", block });
      if (output.length > MAX_OUTPUT_BYTES) finish({ kind: "failed" });
    });
    proc.stdout.on("error", () => {});
    // 标准错误只排空，不看
    proc.stderr.on("data", () => {});
    proc.stderr.on("error", () => {});

    if (spec.stdin !== undefined && proc.stdin !== null) {
      proc.stdin.on("error", () => {}); // 对方已退出时写入会 EPIPE，不是我们的错
      proc.stdin.end(spec.stdin);
    }

    void proc.exited.then(() => {
      drainTimer = setTimeout(() => finish({ kind: "failed" }), EXIT_DRAIN_MS);
    });
  });
}
