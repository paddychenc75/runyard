import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ContractContext } from "./context.ts";

// shell 的契约：interactive 返回 shell 列表，每项有绝对路径和名字（第一个是默认值）。
export function shellContract(ctx: ContractContext): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const platform = ctx.create(home);

  describe("shell.interactive", () => {
    it('"shell.interactive" 每项都有绝对路径和名字', async () => {
      if (!ctx.native && ctx.complete !== true) return;
      const shells = await platform.shell.interactive({ PATH: "/usr/bin:/bin" });
      expect(shells.length).toBeGreaterThan(0);
      for (const shell of shells) {
        expect(shell.path.startsWith("/")).toBe(true);
        expect(shell.name).not.toBe("");
      }
    });
  });
}
