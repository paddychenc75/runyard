import { defineConfig } from "vitest/config";

// Vitest 共用配置。单元测试不许重试（技术设计 §8.3），所以 retry 固定为 0。
//
// 唯一的“平台相关测试”跳过机制（决策记录 0013，docs/guides/testing.md）：
// 需要平台实现的测试，文件名以 `.platform-dependent.test.ts` 结尾；在 Windows 上这类文件不进入测试范围。
// 测试里不写系统判断（platform-branching 检查拦截），系统判断只在这里读一次。
export const PLATFORM_DEPENDENT_GLOB = "**/*.platform-dependent.test.ts";

export function createConfig(host: string = process.platform) {
  const skipPlatformDependent = host === "win32";
  return defineConfig({
    test: {
      include: ["**/*.test.ts"],
      exclude: [
        "**/node_modules/**",
        "**/.tsbuild/**",
        ...(skipPlatformDependent ? [PLATFORM_DEPENDENT_GLOB] : []),
      ],
      retry: 0,
      // 一个包的测试若全是平台相关的，在 Windows 上就一个都不剩；那不是错误
      passWithNoTests: skipPlatformDependent,
    },
  });
}

export default createConfig();
