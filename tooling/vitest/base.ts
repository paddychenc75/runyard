import { defineConfig } from "vitest/config";

// Vitest 共用配置。单元测试不许重试（技术设计 §8.3），所以 retry 固定为 0。
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.tsbuild/**"],
    retry: 0,
    passWithNoTests: false,
  },
});
