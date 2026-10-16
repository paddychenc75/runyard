import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest 共用配置。单元测试不许重试（技术设计 §8.3），所以 retry 固定为 0。
//
// 唯一的“平台相关测试”标记（决策记录 0013，docs/guides/testing.md）：
// 需要平台实现（起真进程、绑真端口、碰真文件系统）的测试，文件名以 `.platform-dependent.test.ts` 结尾。
// 同一个后缀决定两件事，所以不另设概念：
//   1. 它们在单独的“进程测试”阶段（project `process`）里跑，普通单元测试在 project `unit` 里并行跑；
//   2. 在 Windows 上这类文件不进入测试范围。
// 测试里不写系统判断（platform-branching 检查拦截），系统判断只在这里读一次。
export const PLATFORM_DEPENDENT_GLOB = "**/*.platform-dependent.test.ts";

/**
 * 进程测试阶段的超时，全仓库只在这里定一处，各个测试上不再单独写。
 * 依据（实测见 docs/guides/testing.md“进程测试阶段的预算”）：
 * - 单个测试：阶段里最慢的一个在 CI 最慢的系统（macos-26，3 核）上实测约 25 秒，120 秒是它的约 5 倍；
 * - 钩子：收尾最多等 15 秒（TrackedProcesses.killAll 的上限）再加清理，60 秒是这个上限的 4 倍，
 *   旧的默认 10 秒正是那次 macOS 超时的来源。
 * 真正卡死时仍然在 CI 任务的 15 分钟上限之内失败，并指出是哪一个测试。
 */
export const PROCESS_TEST_TIMEOUT_MS = 120_000;
export const PROCESS_HOOK_TIMEOUT_MS = 60_000;

const NEVER_COLLECTED = ["**/node_modules/**", "**/.tsbuild/**"];
const SETUP_QUARANTINE = fileURLToPath(new URL("./quarantine.setup.ts", import.meta.url));
const SETUP_PROCESS_GUARD = fileURLToPath(new URL("./process-guard.setup.ts", import.meta.url));

export function createConfig(host: string = process.platform) {
  const skipPlatformDependent = host === "win32";
  return defineConfig({
    test: {
      retry: 0,
      // 一个包的测试若全是平台相关的，在 Windows 上就一个都不剩；那不是错误
      passWithNoTests: skipPlatformDependent,
      setupFiles: [SETUP_QUARANTINE],
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            include: ["**/*.test.{ts,tsx}"],
            exclude: [...NEVER_COLLECTED, PLATFORM_DEPENDENT_GLOB],
          },
        },
        {
          extends: true,
          test: {
            name: "process",
            include: skipPlatformDependent ? [] : [PLATFORM_DEPENDENT_GLOB],
            exclude: NEVER_COLLECTED,
            // 有界并发：一个工作进程、一次一个文件，进程测试之间不互相抢 CPU；
            // 包与包之间由 `turbo run test:process --concurrency=1` 串行
            fileParallelism: false,
            maxWorkers: 1,
            testTimeout: PROCESS_TEST_TIMEOUT_MS,
            hookTimeout: PROCESS_HOOK_TIMEOUT_MS,
            setupFiles: [SETUP_QUARANTINE, SETUP_PROCESS_GUARD],
          },
        },
      ],
    },
  });
}

export default createConfig();
