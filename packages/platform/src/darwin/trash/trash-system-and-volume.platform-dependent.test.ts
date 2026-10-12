import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatform } from "../../get-platform.ts";
import { absPath } from "../../path-types.ts";
import { isPlatformError } from "../../platform-error.ts";
import {
  buildRichTree,
  makeSandbox,
  makeTreeWritable,
  type Sandbox,
} from "../../test-support/trash-sandbox.ts";
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
    // 磁盘映像在 CI 的运行器上建一次要十几秒：整个组共用一个卷，每个用例用自己的名字和自己的假主目录；
    // 超时由共用配置统一给（进程测试阶段），这里不单写
    let box: Sandbox;
    let mount: string;
    let counter = 0;
    // 同步调用会卡住事件循环，Vitest 的超时管不到它，所以每次都给 hdiutil 一个上限，卡住就抛错
    const hdiutil = (args: string[]) =>
      execFileSync("hdiutil", args, { stdio: "ignore", timeout: 90_000, killSignal: "SIGKILL" });
    let attached = false;
    beforeAll(() => {
      box = makeSandbox();
      mount = box.at("mnt");
      mkdirSync(mount);
      const image = box.at("volume.dmg");
      hdiutil(["create", "-size", "30m", "-fs", "APFS", "-volname", "rytest", image]);
      hdiutil(["attach", "-nobrowse", "-mountpoint", mount, image]);
      attached = true;
    });
    afterAll(() => {
      try {
        if (attached) hdiutil(["detach", "-force", mount]);
      } finally {
        box.remove();
      }
    });

    // 每个用例自己的假主目录（里面的 .Trash 是本卷的废纸篓）
    const fresh = () => {
      const home = join(box.root, `home-${++counter}`);
      mkdirSync(home);
      return {
        home,
        trash: join(home, ".Trash"),
        trashOf: () => createDarwinTrash({ home, uid, now: () => NOW, systemTool: null }),
      };
    };

    it("放进 <卷>/.Trashes/<uid>：.Trashes 模式 1333、<uid> 模式 0700；本卷的废纸篓里什么都没有", async () => {
      const { trash, trashOf } = fresh();
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
      expect(readdirSync(trash)).toEqual([]);
    });

    it("[LIBRARY-PLAYGROUNDS-20] 卷上的废纸篓里已有同名项目：不覆盖", async () => {
      const { trashOf } = fresh();
      for (const marker of ["first", "second"]) {
        const dir = join(mount, "dup");
        mkdirSync(dir);
        writeFileSync(join(dir, "marker.txt"), marker);
        await trashOf()(absPath(dir));
      }
      const own = join(mount, ".Trashes", String(uid));
      expect(readFileSync(join(own, "dup", "marker.txt"), "utf8")).toBe("first");
      expect(readFileSync(join(own, "dup 14.05.09", "marker.txt"), "utf8")).toBe("second");
    });

    it("卷的根目录本身不能移到废纸篓：TRASH_UNAVAILABLE，卷上的内容原样", async () => {
      const { trashOf } = fresh();
      writeFileSync(join(mount, "keep.txt"), "k");
      expect(await codeOf(trashOf()(absPath(mount)))).toBe("TRASH_UNAVAILABLE");
      expect(readFileSync(join(mount, "keep.txt"), "utf8")).toBe("k");
    });

    it("改名不跨卷：把卷上的文件夹 moveDir 到本卷抛错，原目录原样，目标位置不留占位，也不退到复制", async () => {
      const { home } = fresh();
      const platform = createDarwinPlatform({
        home: absPath(home),
        arch: "arm64",
        profile: undefined,
      });
      const dir = join(mount, "mv");
      mkdirSync(dir);
      writeFileSync(join(dir, "marker.txt"), "stay");
      const target = box.at("moved");
      expect(await codeOf(platform.fs.moveDir(absPath(dir), absPath(target)))).toBe("INTERNAL");
      expect(readFileSync(join(dir, "marker.txt"), "utf8")).toBe("stay");
      expect(existsSync(target)).toBe(false);
    });

    it("卷上建不出废纸篓目录（.Trashes 是个文件）：复制到本卷的废纸篓，核对完整后才删原件", async () => {
      const { trash, trashOf } = fresh();
      // 前面的用例已经在卷上建过 .Trashes 目录；这里换成一个同名的文件（沙盒内的卷，守卫照常）
      // .Trashes 是 1333（本人读不了），先放开再删
      chmodSync(box.guard(join(mount, ".Trashes")), 0o700);
      rmSync(box.guard(join(mount, ".Trashes")), { recursive: true });
      writeFileSync(join(mount, ".Trashes"), "not a directory");
      const dir = join(mount, "no-trash-here");
      const reference = box.at("reference");
      buildRichTree(dir);
      buildRichTree(reference);
      const result = await trashOf()(absPath(dir));
      expect(result.restorable).toBe(false);
      expect(existsSync(dir)).toBe(false);
      expect(await compareTrees(reference, join(trash, "no-trash-here"))).toBeUndefined();
      makeTreeWritable(reference);
    });
  });
}

// 在任何系统上都跑：平台的主目录不是账号真实主目录时不用系统命令。
// 若误用了 /usr/bin/trash，东西会进用户真实的废纸篓而不是这个临时主目录里的 .Trash
describe("系统命令只在真实主目录下用", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = makeSandbox();
  });
  afterEach(() => box.remove());

  it("平台指向临时主目录时，fs.trash 进的是临时主目录的 .Trash，结果不是“能放回原处”", async () => {
    const platform = createDarwinPlatform({
      home: absPath(box.home),
      arch: "arm64",
      profile: undefined,
    });
    const dir = box.at("demo");
    mkdirSync(dir);
    writeFileSync(join(dir, "marker.txt"), "x");
    const result = await platform.fs.trash(absPath(dir));
    expect(result.restorable).toBe(false);
    expect(readFileSync(join(box.trash, "demo", "marker.txt"), "utf8")).toBe("x");
  });
});
