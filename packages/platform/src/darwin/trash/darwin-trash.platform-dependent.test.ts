import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absPath } from "../../path-types.ts";
import { isPlatformError } from "../../platform-error.ts";
import { makeSandbox, type Sandbox } from "../../test-support/trash-sandbox.ts";
import { createDarwinTrash } from "./darwin-trash.ts";
import type { TrashConfig } from "./trash-deps.ts";

// fs.trash 在沙盒里的行为（决策记录 0010）：废纸篓是沙盒假主目录下的 .Trash。
// 系统工具用注入的假命令代替；真的 /usr/bin/trash 和别的卷见 trash-system-and-volume.platform-dependent.test.ts。

const NOW = new Date(2026, 9, 12, 14, 5, 9);
const STAMP = "14.05.09";

let box: Sandbox;
beforeEach(() => {
  box = makeSandbox();
});
afterEach(() => box.remove());

function trashOf(overrides: Partial<TrashConfig> = {}) {
  return createDarwinTrash({
    home: box.home,
    uid: process.getuid?.() ?? 0,
    now: () => NOW,
    systemTool: null,
    ...overrides,
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "not-a-platform-error";
  }
  return "no-error";
}

function project(name: string, marker: string): string {
  const dir = box.at(name);
  mkdirSync(dir);
  writeFileSync(join(dir, "marker.txt"), marker);
  return dir;
}

describe("废纸篓：占位再改名", () => {
  it("[LIBRARY-PLAYGROUNDS-19] 文件夹进了废纸篓，原位没有了，结果说明不能放回原处", async () => {
    const dir = project("demo", "one");
    const result = await trashOf()(absPath(dir));
    expect(result).toEqual({ restorable: false, removedDirectly: [] });
    expect(existsSync(dir)).toBe(false);
    expect(readFileSync(join(box.trash, "demo", "marker.txt"), "utf8")).toBe("one");
  });

  it("[LIBRARY-PLAYGROUNDS-20] 废纸篓里已有同名项目：两个都在，先前那个没有被覆盖", async () => {
    const trash = trashOf();
    await trash(absPath(project("demo", "first")));
    await trash(absPath(project("demo", "second")));
    await trash(absPath(project("demo", "third")));
    expect(readFileSync(join(box.trash, "demo", "marker.txt"), "utf8")).toBe("first");
    expect(readFileSync(join(box.trash, `demo ${STAMP}`, "marker.txt"), "utf8")).toBe("second");
    expect(readFileSync(join(box.trash, `demo ${STAMP} 2`, "marker.txt"), "utf8")).toBe("third");
  });

  it("[LIBRARY-PLAYGROUNDS-20] 废纸篓里有同名的空目录：它不会被静默替换（K9 发现的数据丢失缺陷）", async () => {
    mkdirSync(box.trash, { mode: 0o700 });
    mkdirSync(join(box.trash, "demo"));
    const dir = project("demo", "mine");
    await trashOf()(absPath(dir));
    // 事先放着的空目录原样还在、还是空的；我们的项目换了名字
    expect(statSync(join(box.trash, "demo")).isDirectory()).toBe(true);
    expect(readdirSync(join(box.trash, "demo"))).toEqual([]);
    expect(readFileSync(join(box.trash, `demo ${STAMP}`, "marker.txt"), "utf8")).toBe("mine");
  });

  it("[LIBRARY-PLAYGROUNDS-20] 同名的文件也不覆盖，扩展名保留在最后", async () => {
    mkdirSync(box.trash, { mode: 0o700 });
    writeFileSync(join(box.trash, "notes.txt"), "old");
    const file = box.at("notes.txt");
    writeFileSync(file, "new");
    await trashOf()(absPath(file));
    expect(readFileSync(join(box.trash, "notes.txt"), "utf8")).toBe("old");
    expect(readFileSync(join(box.trash, `notes ${STAMP}.txt`), "utf8")).toBe("new");
  });

  it("不列废纸篓的目录：废纸篓不可读（权限 0300，列目录会失败）也照样放得进去", async () => {
    mkdirSync(box.trash, { mode: 0o300 });
    const dir = project("demo", "x");
    await trashOf()(absPath(dir));
    chmodSync(box.trash, 0o700);
    expect(existsSync(join(box.trash, "demo", "marker.txt"))).toBe(true);
  });

  it("文件夹本身是符号链接：移走的是链接，目标目录完好", async () => {
    const target = project("target", "keep");
    const link = box.at("link");
    symlinkSync(target, link);
    await trashOf()(absPath(link));
    expect(existsSync(link)).toBe(false);
    expect(lstatSync(join(box.trash, "link")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(target, "marker.txt"), "utf8")).toBe("keep");
  });

  it("[LIBRARY-PLAYGROUNDS-31] 不存在的文件夹抛 FOLDER_MISSING，废纸篓不受影响", async () => {
    expect(await codeOf(trashOf()(absPath(box.at("nope"))))).toBe("FOLDER_MISSING");
  });

  it("废纸篓放不进去（它是个文件）：抛 TRASH_UNAVAILABLE，原件原样保留，不退到永久删除", async () => {
    writeFileSync(box.trash, "i am a file, not a directory");
    const dir = project("demo", "keep");
    expect(await codeOf(trashOf()(absPath(dir)))).toBe("TRASH_UNAVAILABLE");
    expect(readFileSync(join(dir, "marker.txt"), "utf8")).toBe("keep");
  });
});

describe("废纸篓：系统自带的 trash 命令", () => {
  // 假命令：像真的一样把目录移进沙盒的废纸篓；记录收到的参数
  const fakeTool = (calls: string[][], exit: number, moves: boolean) => ({
    systemTool: "/bin/sh",
    ops: {
      async runTool(tool: string, argv: readonly string[]) {
        calls.push([tool, ...argv]);
        if (moves) {
          mkdirSync(box.trash, { recursive: true });
          renameSync(box.guard(argv[0] as string), join(box.trash, basename(argv[0] as string)));
        }
        return exit;
      },
    },
  });

  it("有命令就用它：参数是一个数组 [命令, 路径]，结果说明能放回原处", async () => {
    const calls: string[][] = [];
    const dir = project("demo", "x");
    const result = await trashOf(fakeTool(calls, 0, true))(absPath(dir));
    expect(calls).toEqual([["/bin/sh", dir]]);
    expect(result.restorable).toBe(true);
    expect(existsSync(join(box.trash, "demo", "marker.txt"))).toBe(true);
  });

  it("命令失败、原件还在：改用占位再改名，原件进了废纸篓，结果是不能放回原处", async () => {
    const calls: string[][] = [];
    const dir = project("demo", "x");
    const result = await trashOf(fakeTool(calls, 1, false))(absPath(dir));
    expect(calls).toHaveLength(1);
    expect(result.restorable).toBe(false);
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(box.trash, "demo", "marker.txt"))).toBe(true);
  });

  it("命令不存在：直接走占位再改名", async () => {
    const calls: string[][] = [];
    const dir = project("demo", "x");
    const config = { ...fakeTool(calls, 0, true), systemTool: join(box.root, "no-such-trash") };
    const result = await trashOf(config)(absPath(dir));
    expect(calls).toEqual([]);
    expect(result.restorable).toBe(false);
  });
});
