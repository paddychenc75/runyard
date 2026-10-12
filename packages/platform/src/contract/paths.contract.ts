import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { absPath } from "../path-types.ts";
import type { ContractContext } from "./context.ts";

// paths 的契约。名称校验的完整表格在 paths/validate-name.test.ts，这里只验证“每个实现都接上了同一份规则”。
export function pathsContract(ctx: ContractContext): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "runyard-contract-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const platform = ctx.create(home);
  const { paths } = platform;

  describe("paths.home", () => {
    it('"paths.home" 是创建时给的主目录', () => {
      expect(paths.home).toBe(home);
    });
  });

  describe("paths.stateDir", () => {
    it('"paths.stateDir" 在主目录下，名字是 .runyard', () => {
      expect(paths.stateDir).toBe(join(home, ".runyard"));
    });
  });

  describe("paths.defaultLibrary", () => {
    it('"paths.defaultLibrary" 在主目录下，不在桌面、文档、下载里', () => {
      expect(paths.defaultLibrary).toBe(join(home, "Runyard"));
      expect(paths.isInUserFolders(paths.defaultLibrary)).toBe(false);
    });
  });

  describe("paths.validateName", () => {
    it('"paths.validateName" 各系统一致：保留名、末尾的点和空格都拒绝', () => {
      expect(paths.validateName("demo-1")).toBeNull();
      expect(paths.validateName("con")).toBe("reserved");
      expect(paths.validateName("CON.txt")).toBe("reserved");
      expect(paths.validateName("demo.")).toBe("trailing-dot-or-space");
      expect(paths.validateName("demo ")).toBe("trailing-dot-or-space");
      expect(paths.validateName("a".repeat(64))).toBeNull();
      expect(paths.validateName("a".repeat(65))).toBe("too-long");
    });
  });

  describe("paths.checkLength", () => {
    it('"paths.checkLength" 短路径是 ok，单个名字超过 255 字节是 too-long', () => {
      expect(paths.checkLength(absPath(join(home, "x".repeat(256))))).toBe("too-long");
    });
  });

  describe("paths.isCloudSynced", () => {
    it('"paths.isCloudSynced" 默认资源库不在网盘同步目录下，Dropbox 下的在', () => {
      expect(paths.isCloudSynced(paths.defaultLibrary)).toBe(false);
      expect(paths.isCloudSynced(absPath(join(home, "Dropbox", "demo")))).toBe(true);
    });
  });

  describe("paths.isInUserFolders", () => {
    it('"paths.isInUserFolders" 桌面、文档、下载里的路径返回 true', () => {
      expect(paths.isInUserFolders(absPath(join(home, "Documents", "demo")))).toBe(true);
      expect(paths.isInUserFolders(absPath(join(home, "Desktop")))).toBe(true);
      expect(paths.isInUserFolders(absPath(join(home, "Projects", "demo")))).toBe(false);
    });
  });
}
