import { statSync } from "node:fs";
import { getPlatform } from "../get-platform.ts";
import type { AbsPath } from "../path-types.ts";
import type { Env, Platform } from "../platform.ts";
import { createPosixToolchain } from "../posix/env/posix-toolchain.ts";
import { isAlive, TrackedProcesses } from "./tracked-processes.ts";

// 用真实的 shell 和真实的 exec/proc 搭一个环境解析器，起的每个进程都记账（pid 加启动时间），
// 收尾时核对无遗留；进程测试阶段的遗留进程守卫是第二道保险。

export const TEST_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

export interface Harness {
  readonly toolchain: Pick<Platform, "env" | "tools" | "shell">;
  readonly platform: Platform;
  readonly tracked: TrackedProcesses;
  /** 到目前为止起过几个进程（用来断言缓存命中时没有起进程） */
  spawnCount(): number;
  /** 起过的进程里现在还活着的 pid（解析返回时应为空；收尾的 killAll 不能代替这个断言） */
  alive(): number[];
}

export interface HarnessOptions {
  readonly home: AbsPath;
  readonly shell: string;
  readonly timeoutMs?: number;
  readonly baseEnv?: Env;
}

export function makeHarness(options: HarnessOptions): Harness {
  // 隔离：只给最小的环境，不继承运行测试的终端的 ZDOTDIR、NVM_DIR 等
  const baseEnv = options.baseEnv ?? { PATH: TEST_PATH, LANG: "en_US.UTF-8" };
  const platform = getPlatform({ home: options.home, profile: undefined, baseEnv });
  const tracked = new TrackedProcesses();
  const pids: number[] = [];
  const toolchain = createPosixToolchain({
    home: options.home,
    baseEnv,
    loginShell: { override: options.shell },
    deps: {
      exec: {
        spawn: (spec) => {
          const child = platform.exec.spawn(spec);
          pids.push(child.ref.pid);
          tracked.track(child.ref.pid);
          return child;
        },
      },
      proc: platform.proc,
    },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  return {
    toolchain,
    platform,
    tracked,
    spawnCount: () => pids.length,
    alive: () => pids.filter(isAlive),
  };
}

/** 用解析出的环境执行 `<tool> --version`（工作目录给定），返回标准输出。垫片管理器在这一步按工作目录选版本 */
export async function versionOf(
  harness: Harness,
  env: Env,
  cwd: AbsPath,
  tool: string,
): Promise<string | null> {
  const path = await harness.platform.exec.which(tool, env, cwd);
  if (path === null) return null;
  const child = harness.platform.exec.spawn({ argv: [path, "--version"], cwd, env, stdin: false });
  harness.tracked.track(child.ref.pid);
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString();
  });
  const closed = new Promise((done) => child.stdout.once("close", done));
  await child.exited;
  await closed;
  return out.trim();
}

/** 本机装了的某个 shell 的路径；没装返回 null（测试据此决定注册哪些用例） */
export function shellPath(name: string): string | null {
  for (const dir of ["/bin", "/usr/bin", "/usr/local/bin", "/opt/homebrew/bin"]) {
    try {
      if (statSync(`${dir}/${name}`).isFile()) return `${dir}/${name}`;
    } catch {
      // 这个目录里没有
    }
  }
  return null;
}
