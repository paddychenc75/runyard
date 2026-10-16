import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type AbsPath, absPath } from "../path-types.ts";
import { isPlatformError } from "../platform-error.ts";
import type { ContractContext } from "./context.ts";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "not-a-platform-error";
  }
  return "no-error";
}

// fs 的契约：只经平台接口自己的成员布置和查看现场，所以真实现和内存版的假平台跑同一组用例。
// 依赖真实磁盘细节的用例（临时文件不留、权限位、废纸篓里的内容、占位改名的竞态）在
// posix/fs/*.platform-dependent.test.ts 和 darwin/trash/*.platform-dependent.test.ts。
export function fsContract(ctx: ContractContext): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "runyard-contract-fs-")));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const { fs } = ctx.create(home);
  let counter = 0;
  // 每个用例一个自己的目录，互不干扰
  const fresh = async (): Promise<(...parts: string[]) => AbsPath> => {
    const base = absPath(join(home, `case-${++counter}`));
    await fs.makeDir(base);
    return (...parts) => absPath(join(base, ...parts));
  };

  describe("fs.makeDir", () => {
    it('"fs.makeDir" 连同缺的上级目录一起建，已存在不报错', async () => {
      const at = await fresh();
      await fs.makeDir(at("a", "b", "c"));
      await fs.makeDir(at("a", "b", "c"));
      expect(await fs.exists(at("a", "b", "c"))).toBe(true);
      expect(await fs.listDirs(at("a"))).toEqual(["b"]);
    });
  });

  describe("fs.exists", () => {
    it('"fs.exists" 文件和目录都算存在，没有的不存在', async () => {
      const at = await fresh();
      await fs.writeFile(at("f.txt"), "x");
      expect(await fs.exists(at("f.txt"))).toBe(true);
      expect(await fs.exists(at())).toBe(true);
      expect(await fs.exists(at("nope"))).toBe(false);
    });
  });

  describe("fs.writeFile", () => {
    it('"fs.writeFile" 写字符串和字节，覆盖已有的文件', async () => {
      const at = await fresh();
      await fs.writeFile(at("a.txt"), "一");
      await fs.writeFile(at("a.txt"), new TextEncoder().encode("二"));
      expect(await fs.readText(at("a.txt"))).toBe("二");
    });

    it('"fs.writeFile" 父目录不存在是错误，不会悄悄建出来', async () => {
      const at = await fresh();
      expect(await codeOf(fs.writeFile(at("missing", "a.txt"), "x"))).toBe("INTERNAL");
      expect(await fs.exists(at("missing"))).toBe(false);
    });
  });

  describe("fs.readText", () => {
    it('"fs.readText" 读回写入的内容；不存在或是目录返回 null', async () => {
      const at = await fresh();
      await fs.writeFile(at("a.txt"), "héllo 你好");
      await fs.makeDir(at("dir"));
      expect(await fs.readText(at("a.txt"))).toBe("héllo 你好");
      expect(await fs.readText(at("nope.txt"))).toBeNull();
      expect(await fs.readText(at("dir"))).toBeNull();
    });
  });

  describe("fs.readBytes", () => {
    it('"fs.readBytes" 读回原样的字节（含不是合法文本的）；不存在或是目录返回 null', async () => {
      const at = await fresh();
      const bytes = new Uint8Array([0, 255, 128, 10, 13, 0xc3]);
      await fs.writeFile(at("a.bin"), bytes);
      await fs.makeDir(at("dir"));
      expect([...((await fs.readBytes(at("a.bin"))) ?? [])]).toEqual([...bytes]);
      expect(await fs.readBytes(at("nope.bin"))).toBeNull();
      expect(await fs.readBytes(at("dir"))).toBeNull();
    });
  });

  describe("fs.appendFile", () => {
    it('"fs.appendFile" 文件不存在就建，已有的接在末尾，不覆盖', async () => {
      const at = await fresh();
      await fs.appendFile(at("a.log"), "一\n");
      await fs.appendFile(at("a.log"), "二\n");
      expect(await fs.readText(at("a.log"))).toBe("一\n二\n");
    });

    it('"fs.appendFile" 父目录不存在是错误，不会悄悄建出来', async () => {
      const at = await fresh();
      expect(await codeOf(fs.appendFile(at("missing", "a.log"), "x"))).toBe("INTERNAL");
      expect(await fs.exists(at("missing"))).toBe(false);
    });
  });

  describe("fs.removeFile", () => {
    it('"fs.removeFile" 删掉一个文件，不存在不报错', async () => {
      const at = await fresh();
      await fs.writeFile(at("a.log"), "x");
      await fs.removeFile(at("a.log"));
      await fs.removeFile(at("a.log"));
      expect(await fs.exists(at("a.log"))).toBe(false);
    });

    it('"fs.removeFile" 不删目录：抛错，目录和里面的东西原样', async () => {
      const at = await fresh();
      await fs.makeDir(at("dir"));
      await fs.writeFile(at("dir", "f.txt"), "x");
      expect(await codeOf(fs.removeFile(at("dir")))).toBe("INTERNAL");
      expect(await fs.readText(at("dir", "f.txt"))).toBe("x");
    });
  });

  describe("fs.listFiles", () => {
    it('"fs.listFiles" 只列下一层的文件，排好序；目录不存在返回空数组', async () => {
      const at = await fresh();
      await fs.makeDir(at("sub"));
      await fs.writeFile(at("sub", "deep.txt"), "x");
      await fs.writeFile(at("b.txt"), "x");
      await fs.writeFile(at("a.txt"), "x");
      expect(await fs.listFiles(at())).toEqual(["a.txt", "b.txt"]);
      expect(await fs.listFiles(at("nope"))).toEqual([]);
    });
  });

  describe("fs.listDirs", () => {
    it('"fs.listDirs" 只列下一层的子目录，排好序；目录不存在返回空数组', async () => {
      const at = await fresh();
      await fs.makeDir(at("b", "deep"));
      await fs.makeDir(at("a"));
      await fs.writeFile(at("loose.txt"), "x");
      expect(await fs.listDirs(at())).toEqual(["a", "b"]);
      expect(await fs.listDirs(at("nope"))).toEqual([]);
    });
  });

  describe("fs.renameFile", () => {
    it('"fs.renameFile" 改文件名；目标已存在抛 NAME_EXISTS，两个文件都原样', async () => {
      const at = await fresh();
      await fs.writeFile(at("a.txt"), "A");
      await fs.writeFile(at("b.txt"), "B");
      await fs.renameFile(at("a.txt"), at("c.txt"));
      expect(await fs.exists(at("a.txt"))).toBe(false);
      expect(await fs.readText(at("c.txt"))).toBe("A");
      expect(await codeOf(fs.renameFile(at("c.txt"), at("b.txt")))).toBe("NAME_EXISTS");
      expect(await fs.readText(at("b.txt"))).toBe("B");
      expect(await fs.readText(at("c.txt"))).toBe("A");
    });
  });

  describe("fs.moveDir", () => {
    it('"fs.moveDir" 改文件夹名，里面的内容跟着走', async () => {
      const at = await fresh();
      await fs.makeDir(at("old", "sub"));
      await fs.writeFile(at("old", "sub", "f.txt"), "内容");
      await fs.moveDir(at("old"), at("new"));
      expect(await fs.exists(at("old"))).toBe(false);
      expect(await fs.readText(at("new", "sub", "f.txt"))).toBe("内容");
    });

    it('"fs.moveDir" 目标已存在（哪怕是空目录）抛 NAME_EXISTS，目标和原目录都原样', async () => {
      const at = await fresh();
      await fs.makeDir(at("src"));
      await fs.writeFile(at("src", "f.txt"), "S");
      await fs.makeDir(at("empty"));
      await fs.makeDir(at("full"));
      await fs.writeFile(at("full", "g.txt"), "G");
      expect(await codeOf(fs.moveDir(at("src"), at("empty")))).toBe("NAME_EXISTS");
      expect(await codeOf(fs.moveDir(at("src"), at("full")))).toBe("NAME_EXISTS");
      expect(await fs.readText(at("src", "f.txt"))).toBe("S");
      expect(await fs.readText(at("full", "g.txt"))).toBe("G");
      expect(await fs.exists(at("empty"))).toBe(true);
    });

    it('"fs.moveDir" 原目录不在抛 FOLDER_MISSING', async () => {
      const at = await fresh();
      expect(await codeOf(fs.moveDir(at("nope"), at("new")))).toBe("FOLDER_MISSING");
      expect(await fs.exists(at("new"))).toBe(false);
    });
  });

  describe("fs.writeAtomic", () => {
    it('"fs.writeAtomic" 新建和覆盖都得到完整的新内容', async () => {
      const at = await fresh();
      await fs.writeAtomic(at("s.json"), '{"v":1}');
      expect(await fs.readText(at("s.json"))).toBe('{"v":1}');
      await fs.writeAtomic(at("s.json"), '{"v":2}', { private: true });
      expect(await fs.readText(at("s.json"))).toBe('{"v":2}');
    });

    it('"fs.writeAtomic" 父目录不存在是错误，目标没有被建出来', async () => {
      const at = await fresh();
      expect(await codeOf(fs.writeAtomic(at("missing", "s.json"), "x"))).toBe("INTERNAL");
      expect(await fs.exists(at("missing"))).toBe(false);
    });
  });

  describe("fs.trash", () => {
    if (ctx.unsupported.has("fs.trash")) {
      it('"fs.trash" 这个系统不支持：抛 NOT_SUPPORTED，文件夹原样', async () => {
        const at = await fresh();
        await fs.makeDir(at("d"));
        expect(await codeOf(fs.trash(at("d")))).toBe("NOT_SUPPORTED");
        expect(await fs.exists(at("d"))).toBe(true);
      });
      return;
    }
    it('"fs.trash" 文件夹离开原位，结果说明能不能放回原处；没有的文件夹抛 FOLDER_MISSING', async () => {
      const at = await fresh();
      await fs.makeDir(at("gone"));
      await fs.writeFile(at("gone", "f.txt"), "x");
      const result = await fs.trash(at("gone"));
      expect(typeof result.restorable).toBe("boolean");
      expect(result.removedDirectly).toEqual([]);
      expect(await fs.exists(at("gone"))).toBe(false);
      expect(await codeOf(fs.trash(at("gone")))).toBe("FOLDER_MISSING");
    });
  });
}
