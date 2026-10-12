import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPlatform } from "../../get-platform.ts";
import { absPath } from "../../path-types.ts";
import { isPlatformError } from "../../platform-error.ts";
import { buildRichTree, makeSandbox, type Sandbox } from "../../test-support/trash-sandbox.ts";
import { createDarwinPlatform } from "../index.ts";
import { createDarwinTrash } from "./darwin-trash.ts";
import { compareTrees } from "./verify-copy.ts";

// 只有 macOS 上才有 /usr/bin/trash 和 hdiutil，所以这些用例只在本机就是 darwin 时注册
//（与契约测试的 native 同一个做法，不用跳过）。
//
// 手动核对（自动化做不到，只能由负责人看一次）：在 Finder 里确认 /usr/bin/trash 放进废纸篓的文件夹
// 右键有“放回原处”并真的能放回；用占位改名放进去的文件夹看得到、能拖回；整个过程没有任何权限弹窗。
// 证据文件 0010 第 10 节有同样的清单。

const isDarwin = getPlatform({ home: absPath(process.cwd()) }).id === "darwin";
const NOW = new Date(2026, 9, 12, 14, 5, 9);
const uid = userInfo().uid;

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isPlatformError(error) ? error.error.code : "not-a-platform-error";
  }
  return "no-error";
}

if (isDarwin) {
  describe("系统自带的 /usr/bin/trash（真实废纸篓）", () => {
    let box: Sandbox;
    beforeEach(() => {
      box = makeSandbox();
    });
    afterEach(() => box.remove());

    it("[LIBRARY-PLAYGROUNDS-19] 进了真实的 ~/.Trash，结果说明能放回原处；测完逐项清掉自己放的东西", async () => {
      const realHome = userInfo().homedir;
      const name = `runyard-test-${randomBytes(6).toString("hex")}`;
      const dir = box.at(name);
      mkdirSync(dir);
      writeFileSync(join(dir, "marker.txt"), name);
      const landed = join(realHome, ".Trash", name);
      try {
        const platform = createDarwinPlatform({
          home: absPath(realHome),
          arch: "arm64",
          profile: undefined,
        });
        const result = await platform.fs.trash(absPath(dir));
        expect(result).toEqual({ restorable: true, removedDirectly: [] });
        expect(existsSync(dir)).toBe(false);
        // 只能 stat 不能列目录（废纸篓列目录会被隐私保护拒绝）
        expect(readFileSync(join(landed, "marker.txt"), "utf8")).toBe(name);
      } finally {
        // 只清自己的：名字带唯一前缀，且必须正好在真实废纸篓的第一层
        if (landed === join(realHome, ".Trash", name) && name.startsWith("runyard-test-")) {
          rmSync(landed, { recursive: true, force: true });
        }
      }
      expect(existsSync(landed)).toBe(false);
    });
  });

  describe("别的卷（磁盘映像）", () => {
    let box: Sandbox;
    let mount: string;
    beforeEach(() => {
      box = makeSandbox();
      mount = box.at("mnt");
      mkdirSync(mount);
      const image = box.at("volume.dmg");
      execFileSync(
        "hdiutil",
        ["create", "-size", "30m", "-fs", "APFS", "-volname", "rytest", image],
        {
          stdio: "ignore",
        },
      );
      execFileSync("hdiutil", ["attach", "-nobrowse", "-mountpoint", mount, image], {
        stdio: "ignore",
      });
    });
    afterEach(() => {
      try {
        execFileSync("hdiutil", ["detach", "-force", mount], { stdio: "ignore" });
      } finally {
        box.remove();
      }
    });

    const trashOf = () =>
      createDarwinTrash({ home: box.home, uid, now: () => NOW, systemTool: null });

    it("放进 <卷>/.Trashes/<uid>：.Trashes 模式 1333、<uid> 模式 0700；本卷的废纸篓里什么都没有", async () => {
      const dir = join(mount, "demo");
      mkdirSync(dir);
      writeFileSync(join(dir, "marker.txt"), "vol");
      const result = await trashOf()(absPath(dir));
      expect(result.restorable).toBe(false);
      expect(existsSync(dir)).toBe(false);
      const own = join(mount, ".Trashes", String(uid));
      expect(readFileSync(join(own, "demo", "marker.txt"), "utf8")).toBe("vol");
      expect(statSync(join(mount, ".Trashes")).mode & 0o7777).toBe(0o1333);
      expect(statSync(own).mode & 0o777).toBe(0o700);
      expect(readdirSync(box.trash)).toEqual([]);
    });

    it("[LIBRARY-PLAYGROUNDS-20] 卷上的废纸篓里已有同名项目：不覆盖", async () => {
      for (const marker of ["first", "second"]) {
        const dir = join(mount, "demo");
        mkdirSync(dir);
        writeFileSync(join(dir, "marker.txt"), marker);
        await trashOf()(absPath(dir));
      }
      const own = join(mount, ".Trashes", String(uid));
      expect(readFileSync(join(own, "demo", "marker.txt"), "utf8")).toBe("first");
      expect(readFileSync(join(own, "demo 14.05.09", "marker.txt"), "utf8")).toBe("second");
    });

    it("卷上建不出废纸篓目录（.Trashes 是个文件）：复制到本卷的废纸篓，核对完整后才删原件", async () => {
      writeFileSync(join(mount, ".Trashes"), "not a directory");
      const dir = join(mount, "demo");
      const reference = box.at("reference");
      buildRichTree(dir);
      buildRichTree(reference);
      const result = await trashOf()(absPath(dir));
      expect(result.restorable).toBe(false);
      expect(existsSync(dir)).toBe(false);
      expect(await compareTrees(reference, join(box.trash, "demo"))).toBeUndefined();
    });

    it("卷的根目录本身不能移到废纸篓：TRASH_UNAVAILABLE，卷上的内容原样", async () => {
      writeFileSync(join(mount, "keep.txt"), "k");
      expect(await codeOf(trashOf()(absPath(mount)))).toBe("TRASH_UNAVAILABLE");
      expect(readFileSync(join(mount, "keep.txt"), "utf8")).toBe("k");
    });

    it("改名不跨卷：把卷上的文件夹 moveDir 到本卷抛错，原目录原样，目标位置不留占位，也不退到复制", async () => {
      const platform = createDarwinPlatform({
        home: absPath(box.home),
        arch: "arm64",
        profile: undefined,
      });
      const dir = join(mount, "demo");
      mkdirSync(dir);
      writeFileSync(join(dir, "marker.txt"), "stay");
      const target = box.at("moved");
      expect(await codeOf(platform.fs.moveDir(absPath(dir), absPath(target)))).toBe("INTERNAL");
      expect(readFileSync(join(dir, "marker.txt"), "utf8")).toBe("stay");
      expect(existsSync(target)).toBe(false);
    });
  });
}
