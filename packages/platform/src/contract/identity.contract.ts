import { describe, expect, it } from "vitest";
import type { ContractContext } from "./context.ts";

const HOME = process.cwd();

// id、arch、caps：只读属性，接口里没有 POSIX 的说法
export function identityContract(ctx: ContractContext): void {
  const platform = ctx.create(HOME);

  describe("id", () => {
    it("是实现自己的名字", () => {
      expect(platform.id).toBe(ctx.name);
    });
  });

  describe("arch", () => {
    it("是 x64 或 arm64", () => {
      expect(["x64", "arm64"]).toContain(platform.arch);
    });
  });

  describe("caps.gracefulStop", () => {
    it("只有 graceful 和 none 两种取值，不写信号名", () => {
      expect(["graceful", "none"]).toContain(platform.caps.gracefulStop);
    });
  });

  describe("caps.cloneCopy", () => {
    it("是布尔值", () => {
      expect(typeof platform.caps.cloneCopy).toBe("boolean");
    });
  });

  describe("caps.symlinks", () => {
    it("是布尔值", () => {
      expect(typeof platform.caps.symlinks).toBe("boolean");
    });
  });

  describe("caps.sandbox", () => {
    it("是布尔值", () => {
      expect(typeof platform.caps.sandbox).toBe("boolean");
    });
  });
}
