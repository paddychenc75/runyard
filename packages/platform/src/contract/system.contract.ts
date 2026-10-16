import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ContractContext } from "./context.ts";

// system 的契约：release 返回非空的版本串，同一个实现每次返回同一个值
export function systemContract(ctx: ContractContext): void {
  const platform = ctx.create(tmpdir());
  describe("system.release", () => {
    it('"system.release" 返回非空的版本串，多次调用结果相同', () => {
      const first = platform.system.release();
      expect(first).not.toBe("");
      expect(platform.system.release()).toBe(first);
    });
  });
}
