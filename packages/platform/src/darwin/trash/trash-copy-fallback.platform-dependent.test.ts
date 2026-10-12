import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absPath } from "../../path-types.ts";
import { isPlatformError } from "../../platform-error.ts";
import {
  buildBigTree,
  buildRichTree,
  makeSandbox,
  makeTreeWritable,
  type Sandbox,
} from "../../test-support/trash-sandbox.ts";
import { createDarwinTrash } from "./darwin-trash.ts";
import { defaultTrashOps, type TrashConfig, type TrashOps } from "./trash-deps.ts";
import { compareTrees } from "./verify-copy.ts";

// 没有可用的废纸篓目录（或改名跨了卷）时的兜底：复制、核对、再删原件（决策记录 0010 第 6.1 节）。
// 这里不真的跨卷：用注入的 rename 在“原件 -> 废纸篓”这一步报 EXDEV，让实现走兜底；
// 真的别的卷（磁盘映像）见 trash-system-and-volume.platform-dependent.test.ts。

const NOW = new Date(2026, 9, 12, 14, 5, 9);

let box: Sandbox;
beforeEach(() => {
  box = makeSandbox();
});
afterEach(() => box.remove());

// 原件到废纸篓的改名失败（像跨卷），兜底里临时副本的改名照常
function crossVolume(item: string, more: Partial<TrashOps> = {}): Partial<TrashOps> {
  return {
    async rename(from, to) {
      if (from === item) throw Object.assign(new Error("cross-device"), { code: "EXDEV" });
      return defaultTrashOps.rename(from, to);
    },
    ...more,
  };
}

function trashOf(ops: Partial<TrashOps>) {
  const config: TrashConfig = {
    home: box.home,
    uid: process.getuid?.() ?? 0,
    now: () => NOW,
    systemTool: null,
    ops,
  };
  return createDarwinTrash(config);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "not-a-platform-error";
  }
  return "no-error";
}

const trashEntries = () => (existsSync(box.trash) ? readdirSync(box.trash) : []);

describe("废纸篓：复制再删原件的兜底", () => {
  it("复制、核对完整之后才删原件；废纸篓里的副本与原件逐项一致（含权限、悬空链接、空目录、中文名）", async () => {
    const dir = box.at("demo");
    const reference = box.at("reference");
    buildRichTree(dir);
    buildRichTree(reference);
    const result = await trashOf(crossVolume(dir))(absPath(dir));
    expect(result).toEqual({ restorable: false, removedDirectly: [] });
    expect(existsSync(dir)).toBe(false);
    expect(trashEntries()).toEqual(["demo"]);
    expect(await compareTrees(reference, join(box.trash, "demo"))).toBeUndefined();
    expect(lstatSync(join(box.trash, "demo", "link-dangling")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(box.trash, "demo", "rodir")).mode & 0o777).toBe(0o555);
    makeTreeWritable(reference);
  });

  it("复制漏了一个文件：核对不过，原件完整保留，废纸篓里没有半成品，抛 TRASH_UNAVAILABLE", async () => {
    const dir = box.at("demo");
    buildRichTree(dir);
    const lossy = {
      // 模拟“复制悄悄丢文件”：复制完把一个文件删掉，不报错
      async copyTree(from: string, to: string) {
        await defaultTrashOps.copyTree(from, to);
        rmSync(join(to, "sub", "deep", "f.bin"));
      },
    };
    expect(await codeOf(trashOf(crossVolume(dir, lossy))(absPath(dir)))).toBe("TRASH_UNAVAILABLE");
    // 原件一个都没少
    expect(readFileSync(join(dir, "sub", "deep", "f.bin")).length).toBe(4);
    expect(readFileSync(join(dir, "中文 名.txt"), "utf8")).toBe("内容");
    expect(trashEntries()).toEqual([]);
  });

  it("复制的内容被改过（大小一样、字节不同）也核对得出来，原件保留", async () => {
    const dir = box.at("demo");
    buildRichTree(dir);
    const corrupting = {
      async copyTree(from: string, to: string) {
        await defaultTrashOps.copyTree(from, to);
        chmodSync(join(to, "ro.txt"), 0o644);
        writeFileSync(join(to, "ro.txt"), "READONLY");
        chmodSync(join(to, "ro.txt"), 0o444);
      },
    };
    expect(await codeOf(trashOf(crossVolume(dir, corrupting))(absPath(dir)))).toBe(
      "TRASH_UNAVAILABLE",
    );
    expect(readFileSync(join(dir, "ro.txt"), "utf8")).toBe("readonly");
    expect(trashEntries()).toEqual([]);
  });

  it("复制中途失败：原件原样保留，废纸篓里不留半成品", async () => {
    const dir = box.at("demo");
    buildRichTree(dir);
    const failing = {
      async copyTree(_from: string, to: string) {
        mkdirSync(to);
        writeFileSync(join(to, "partial.txt"), "half");
        throw new Error("disk full");
      },
    };
    expect(await codeOf(trashOf(crossVolume(dir, failing))(absPath(dir)))).toBe(
      "TRASH_UNAVAILABLE",
    );
    expect(readFileSync(join(dir, "index.js"), "utf8")).toBe("console.log(1)\n");
    expect(trashEntries()).toEqual([]);
  });

  it("源里有读不了的文件：真的复制失败，原件保留", async () => {
    const dir = box.at("demo");
    buildRichTree(dir);
    chmodSync(join(dir, "index.js"), 0o000);
    expect(await codeOf(trashOf(crossVolume(dir))(absPath(dir)))).toBe("TRASH_UNAVAILABLE");
    expect(existsSync(join(dir, "index.js"))).toBe(true);
    expect(trashEntries()).toEqual([]);
  });

  it("兜底也不覆盖废纸篓里的同名空目录", async () => {
    mkdirSync(box.trash, { mode: 0o700 });
    mkdirSync(join(box.trash, "demo"));
    const dir = box.at("demo");
    buildRichTree(dir);
    await trashOf(crossVolume(dir))(absPath(dir));
    expect(readdirSync(join(box.trash, "demo"))).toEqual([]);
    expect(existsSync(join(box.trash, "demo 14.05.09", "index.js"))).toBe(true);
  });

  it("原件的上级目录不可写：复制之前就拒绝，什么都不复制，原件原样", async () => {
    const dir = box.at("demo");
    buildRichTree(dir);
    chmodSync(box.at(), 0o555);
    expect(await codeOf(trashOf(crossVolume(dir))(absPath(dir)))).toBe("TRASH_UNAVAILABLE");
    chmodSync(box.at(), 0o755);
    expect(existsSync(join(dir, "index.js"))).toBe(true);
    expect(trashEntries()).toEqual([]);
  });

  it("副本已完整进了废纸篓但原件删不干净（复制期间上级目录变成不可写）：如实报 TRASH_UNAVAILABLE，副本留在废纸篓", async () => {
    const dir = box.at("demo");
    mkdirSync(dir);
    writeFileSync(join(dir, "top.txt"), "y");
    const racing = {
      async copyTree(from: string, to: string) {
        await defaultTrashOps.copyTree(from, to);
        chmodSync(box.at(), 0o555);
      },
    };
    expect(await codeOf(trashOf(crossVolume(dir, racing))(absPath(dir)))).toBe("TRASH_UNAVAILABLE");
    chmodSync(box.at(), 0o755);
    expect(readFileSync(join(box.trash, "demo", "top.txt"), "utf8")).toBe("y");
  });
});

describe("废纸篓：三千个文件的耗时", () => {
  it("改名路径与复制兜底各放一棵三千个文件的树，原件都消失、文件数不变", async () => {
    const count = 3000;
    const renamed = box.at("big-rename");
    const copied = box.at("big-copy");
    buildBigTree(renamed, count);
    buildBigTree(copied, count);

    let started = performance.now();
    await trashOf({})(absPath(renamed));
    const renameMs = performance.now() - started;

    started = performance.now();
    await trashOf(crossVolume(copied))(absPath(copied));
    const copyMs = performance.now() - started;

    const countFiles = (dir: string): number =>
      readdirSync(dir, { withFileTypes: true }).reduce(
        (sum, entry) => sum + (entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1),
        0,
      );
    expect(countFiles(join(box.trash, "big-rename"))).toBe(count);
    expect(countFiles(join(box.trash, "big-copy"))).toBe(count);
    expect(existsSync(renamed) || existsSync(copied)).toBe(false);
    // 数字进测试输出，写 PR 时引用；上限只防失控（改名是毫秒级，复制兜底在 APFS 上是秒级）
    console.info(
      `[trash timing] ${count} files: rename ${renameMs.toFixed(1)} ms, copy+verify+remove ${copyMs.toFixed(0)} ms`,
    );
    expect(renameMs).toBeLessThan(2000);
    expect(copyMs).toBeLessThan(30_000);
  }, 60_000);
});
