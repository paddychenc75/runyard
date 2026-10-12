import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { absPath } from "../path-types.ts";
import type { ContractContext } from "./context.ts";

// exec 的契约：spawnDetached（which 和 spawn 在 exec-process.contract.ts，它们要起真进程，只对本机的实现跑）。脱钩、标准输入输出、工作目录的完整测试在
// src/spawn-detached.platform-dependent.test.ts。
export function execContract(ctx: ContractContext): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const platform = ctx.create(home);
  const logFile = absPath(join(home, "out.log"));

  describe("exec.spawnDetached", () => {
    it('"exec.spawnDetached" 空参数列表抛 INTERNAL', async () => {
      await expect(platform.exec.spawnDetached([], { env: {}, logFile })).rejects.toMatchObject({
        error: { code: "INTERNAL" },
      });
    });

    it('"exec.spawnDetached" 启动命令并返回 pid；命令在状态目录里执行', async () => {
      if (!ctx.native) return;
      const marker = join(platform.paths.stateDir, "marker");
      const script = `require("node:fs").writeFileSync("marker", "ok")`;
      const { pid } = await platform.exec.spawnDetached([process.execPath, "-e", script], {
        env: {},
        logFile,
      });
      expect(pid).toBeGreaterThan(0);
      for (let i = 0; i < 250 && !existsSync(marker); i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(existsSync(marker)).toBe(true);
    });
  });
}
