import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absPath } from "../../path-types.ts";
import { isPlatformError } from "../../platform-error.ts";
import { makeSandbox, type Sandbox } from "../../test-support/trash-sandbox.ts";
import { fsError } from "./map-fs-error.ts";
import { createPosixFs } from "./posix-fs.ts";

// 真磁盘上的文件操作：错误码映射、先占位再改名不覆盖、大小写改名、并发。契约测试（fs.contract.ts）管所有实现共有的行为。

let box: Sandbox;
beforeEach(() => {
  box = makeSandbox();
});
afterEach(() => box.remove());

const fs = createPosixFs();

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "not-a-platform-error";
  }
  return "no-error";
}

describe("错误码映射", () => {
  it("[LIBRARY-PLAYGROUNDS-32] EBUSY、EPERM、EACCES 都是 PATH_LOCKED，带文件夹名", () => {
    for (const code of ["EBUSY", "EPERM", "EACCES"]) {
      const mapped = fsError(Object.assign(new Error(code), { code }), "/x/demo", "rename");
      expect(mapped.error).toMatchObject({ code: "PATH_LOCKED", params: { name: "demo" } });
    }
  });

  it("ENAMETOOLONG 是 PATH_TOO_LONG；别的意料之外的错误是 INTERNAL，系统码只在 debug 里", () => {
    const long = fsError(
      Object.assign(new Error("x"), { code: "ENAMETOOLONG" }),
      "/x/demo",
      "mkdir",
    );
    expect(long.error.code).toBe("PATH_TOO_LONG");
    const other = fsError(Object.assign(new Error("x"), { code: "ENOSPC" }), "/x/demo", "write");
    expect(other.error).toMatchObject({ code: "INTERNAL", params: {} });
    expect(other.error.debug).toContain("ENOSPC");
  });
});

describe("真磁盘", () => {
  it("[LIBRARY-PLAYGROUNDS-32] 上级目录不可写（EACCES）：moveDir 抛 PATH_LOCKED，文件夹仍叫原名、内容完好，目标不留占位", async () => {
    const dir = box.at("demo");
    mkdirSync(dir);
    writeFileSync(join(dir, "f.txt"), "keep");
    chmodSync(box.at(), 0o555);
    const code = await codeOf(fs.moveDir(absPath(dir), absPath(box.at("demo2"))));
    chmodSync(box.at(), 0o755);
    expect(code).toBe("PATH_LOCKED");
    expect(readFileSync(join(dir, "f.txt"), "utf8")).toBe("keep");
    expect(existsSync(box.at("demo2"))).toBe(false);
  });

  it("名字超过 255 字节：makeDir 抛 PATH_TOO_LONG", async () => {
    expect(await codeOf(fs.makeDir(absPath(box.at("x".repeat(300)))))).toBe("PATH_TOO_LONG");
  });

  it("目标是已有的空目录：NAME_EXISTS，空目录没有被替换（POSIX 的 rename 会静默替换它）", async () => {
    const src = box.at("src");
    mkdirSync(src);
    writeFileSync(join(src, "f.txt"), "S");
    mkdirSync(box.at("target"));
    expect(await codeOf(fs.moveDir(absPath(src), absPath(box.at("target"))))).toBe("NAME_EXISTS");
    expect(readdirSync(box.at("target"))).toEqual([]);
    expect(readFileSync(join(src, "f.txt"), "utf8")).toBe("S");
  });

  it("两个 moveDir 同时抢同一个目标：恰好一个成功，另一个 NAME_EXISTS，谁的内容都没丢", async () => {
    for (const name of ["a", "b"]) {
      mkdirSync(box.at(name));
      writeFileSync(box.at(name, "f.txt"), name);
    }
    const results = await Promise.all(
      ["a", "b"].map((name) => codeOf(fs.moveDir(absPath(box.at(name)), absPath(box.at("t"))))),
    );
    expect(results.sort()).toEqual(["NAME_EXISTS", "no-error"]);
    const winner = readFileSync(box.at("t", "f.txt"), "utf8");
    const loser = winner === "a" ? "b" : "a";
    expect(readFileSync(box.at(loser, "f.txt"), "utf8")).toBe(loser);
  });

  it("只改大小写（Demo 改成 demo）：成功，内容还在，不报 NAME_EXISTS", async () => {
    mkdirSync(box.at("Demo"));
    writeFileSync(box.at("Demo", "f.txt"), "x");
    await fs.moveDir(absPath(box.at("Demo")), absPath(box.at("demo")));
    expect(readdirSync(box.at())).toEqual(["demo"]);
    expect(readFileSync(box.at("demo", "f.txt"), "utf8")).toBe("x");
  });

  it("不能移进自己里面", async () => {
    mkdirSync(box.at("demo"));
    expect(
      await codeOf(fs.moveDir(absPath(box.at("demo")), absPath(box.at("demo", "inner")))),
    ).toBe("INTERNAL");
    expect(readdirSync(box.at("demo"))).toEqual([]);
  });

  it("renameFile 目标已存在：NAME_EXISTS，两个文件原样；成功时占位被换成了真文件", async () => {
    writeFileSync(box.at("a.txt"), "A");
    writeFileSync(box.at("b.txt"), "B");
    expect(await codeOf(fs.renameFile(absPath(box.at("a.txt")), absPath(box.at("b.txt"))))).toBe(
      "NAME_EXISTS",
    );
    await fs.renameFile(absPath(box.at("a.txt")), absPath(box.at("c.txt")));
    expect(readFileSync(box.at("c.txt"), "utf8")).toBe("A");
  });

  it("listDirs 把指向目录的符号链接也算进去，指向文件或悬空的不算", async () => {
    mkdirSync(box.at("real"));
    symlinkSync(box.at("real"), box.at("linked"));
    writeFileSync(box.at("file.txt"), "x");
    symlinkSync(box.at("file.txt"), box.at("to-file"));
    symlinkSync(box.at("nowhere"), box.at("dangling"));
    expect(await fs.listDirs(absPath(box.at()))).toEqual(["linked", "real"]);
  });

  it("exists：悬空的符号链接占着名字，算存在", async () => {
    symlinkSync(box.at("nowhere"), box.at("dangling"));
    expect(await fs.exists(absPath(box.at("dangling")))).toBe(true);
  });
});
