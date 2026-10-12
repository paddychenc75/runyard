import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ContractContext } from "./context.ts";

// env 的契约：load 返回 { env, source, ms }，来源是登记过的值；runDefaults 是字符串表。
// 具体的解析算法（标记、超时、回退、缓存）在 src/posix/env/ 的测试里。load 会起真的登录 shell，
// 所以只对本机的实现跑；主目录是这次测试自己的空临时目录，不读用户真实的启动文件。
const SOURCES = ["login-shell", "login-shell-degraded", "path-only", "fallback"];

export function envContract(ctx: ContractContext): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const platform = ctx.create(home);

  describe("env.load", () => {
    it('"env.load" 返回环境、来源和耗时；环境里有 PATH', async () => {
      if (!ctx.native && ctx.complete !== true) return;
      const result = await platform.env.load();
      expect(SOURCES).toContain(result.source);
      expect(result.ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.env.PATH).toBe("string");
      if (result.source === "fallback") expect(["timeout", "failed"]).toContain(result.reason);
      await result.refreshing;
    });
  });

  describe("env.runDefaults", () => {
    it('"env.runDefaults" 返回字符串表', () => {
      const defaults = platform.env.runDefaults();
      for (const value of Object.values(defaults)) expect(typeof value).toBe("string");
    });
  });
}
