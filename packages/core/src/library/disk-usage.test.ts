import { join } from "node:path";
import { absPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { describe, expect, it } from "vitest";
import { computeDiskUsage } from "./disk-usage.ts";

const BLOCK = 4096;
// 先过 join 归一化分隔符：内存文件系统按字符串比较路径，Windows 任务上要对得上
const root = absPath(join("/lib", "demo"));
const at = (...parts: string[]) => absPath(join(root, ...parts));

function setup() {
  const fake = createFakePlatform();
  fake.fs.mkdir(root);
  return {
    fs: fake.fs,
    scan: (stop?: () => boolean) =>
      computeDiskUsage(fake.platform.fs, root, stop ? { shouldStop: stop } : {}),
  };
}

describe("项目大小的计算", () => {
  it("[LIBRARY-DISK-USAGE-01] 总大小与依赖分开记，嵌套的依赖目录不重复数", async () => {
    const { fs, scan } = setup();
    for (let i = 0; i < 3; i++) fs.writeFile(at("src", `f${i}.ts`), "x");
    for (let i = 0; i < 200; i++) fs.writeFile(at("node_modules", `p${i}.js`), "x");
    for (let i = 0; i < 50; i++) fs.writeFile(at("web", "node_modules", `q${i}.js`), "x");
    // 依赖目录里再套的依赖目录：只算一次
    fs.writeFile(at("node_modules", "a", "node_modules", "deep.js"), "x");
    fs.writeFile(at(".runyard", "run.log"), "x");
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    // 依赖：两个 node_modules 的目录块 + 里面全部文件 + 里面套的目录和文件
    const nodeModulesDirs = 1 + 1 /* a */ + 1 /* a/node_modules */ + 1 /* web/node_modules */;
    const depFiles = 200 + 50 + 1;
    expect(result.dependencyBytes).toBe((nodeModulesDirs + depFiles) * BLOCK);
    expect(result.dependencyDirs).toEqual(["node_modules"]);
    // 总大小含 .runyard；之差是 src、.runyard、web、根目录自己和它们里的文件
    const rest = result.totalBytes - result.dependencyBytes;
    expect(rest).toBe((1 /* 根 */ + 1 /* src */ + 3 + 1 /* .runyard */ + 1 + 1) /* web */ * BLOCK);
    expect(result.unreadable).toBe(0);
  });

  it("[LIBRARY-DISK-USAGE-02] Python 项目的 .venv 全算依赖，main.py 不算", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("main.py"), "print(1)");
    fs.writeFile(at(".venv", "bin", "python"), "x");
    fs.writeFile(at(".venv", "lib.py"), "x");
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    expect(result.dependencyDirs).toEqual([".venv"]);
    expect(result.dependencyBytes).toBe((1 /* .venv */ + 1 /* bin */ + 2) * BLOCK);
    expect(result.totalBytes).toBe(result.dependencyBytes + 2 * BLOCK);
  });

  it("[LIBRARY-DISK-USAGE-05] 找不到文件夹的项目没有大小", async () => {
    const fake = createFakePlatform();
    expect(await computeDiskUsage(fake.platform.fs, absPath(join("/lib", "gone")))).toBe("missing");
  });

  it("[LIBRARY-DISK-USAGE-06] 1 字节的文件按一整块算", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("one"), "x");
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    expect(result.totalBytes).toBe(2 * BLOCK);
  });

  it("[LIBRARY-DISK-USAGE-07] 同一份数据的硬链接只算一次", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("a.bin"), new Uint8Array(1_000_000));
    fs.hardLink(at("b.bin"), at("a.bin"));
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    const fileBytes = Math.ceil(1_000_000 / BLOCK) * BLOCK;
    expect(result.totalBytes).toBe(BLOCK + fileBytes);
  });

  it("[LIBRARY-DISK-USAGE-08] 符号链接只算链接本身，指向自己根目录的环也正常结束", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("f"), "x");
    fs.symlink(at("big"));
    fs.symlink(at("self"));
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    expect(result.totalBytes).toBe(BLOCK /* 根 */ + BLOCK /* f */ + 2 * BLOCK /* 两个链接 */);
  });

  it("[LIBRARY-DISK-USAGE-09] 不进入挂在项目里的另一个卷", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("f"), "x");
    fs.mount(at("mnt"), 2);
    fs.writeFile(at("mnt", "huge.bin"), new Uint8Array(500_000));
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    expect(result.totalBytes).toBe(2 * BLOCK);
  });

  it("[LIBRARY-DISK-USAGE-09] 父扫描后子目录换成另一卷：拒绝结果，不把新卷的内容混进大小", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("sub", "external"), new Uint8Array(500_000));
    fs.onScanDir = (dir) => {
      if (dir === root) queueMicrotask(() => fs.mount(at("sub"), 2));
    };
    expect(await scan()).toBe("changed");
  });

  it("[LIBRARY-DISK-USAGE-10] 遍历中途文件被删：结果正常、不记为读不了、删掉的不计", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("keep"), "x");
    fs.writeFile(at("sub", "late"), "x");
    // 读到 sub 之前把它整个删掉
    fs.onScanDir = (dir) => {
      if (dir === root) queueMicrotask(() => fs.remove(at("sub")));
    };
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    expect(result.unreadable).toBe(0);
    expect(result.totalBytes).toBe(2 * BLOCK);
  });

  it("[LIBRARY-DISK-USAGE-11] 跳过读不了的文件夹，记 1 处，其余照算", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("ok"), "x");
    fs.writeFile(at("secret", "hidden"), "x");
    fs.denyRead(at("secret"));
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    expect(result.unreadable).toBe(1);
    // 根、ok、secret 文件夹自己的一块；secret 里的不计
    expect(result.totalBytes).toBe(3 * BLOCK);
  });

  it("[LIBRARY-DISK-USAGE-12] 权限恢复后再算：含 secret 的占用，不再有读不了的", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("secret", "hidden"), "x");
    fs.denyRead(at("secret"));
    await scan();
    fs.denyRead(at("secret"), false);
    const result = await scan();
    if (typeof result === "string") throw new Error(result);
    expect(result.unreadable).toBe(0);
    expect(result.totalBytes).toBe(3 * BLOCK);
  });

  it("被要求放弃时不再往下读", async () => {
    const { fs, scan } = setup();
    fs.writeFile(at("a", "f"), "x");
    expect(await scan(() => true)).toBe("stopped");
  });
});

it("[LIBRARY-DISK-USAGE-11] 根层和依赖目录的拒绝子项累计不完整数，可读项仍相加", async () => {
  const fake = createFakePlatform();
  const root = absPath(join("/project"));
  const dependency = absPath(join(root, "node_modules"));
  fake.fs.mkdir(dependency);
  fake.fs.writeFile(absPath(join(root, "ok")), "x");
  fake.fs.writeFile(absPath(join(dependency, "ok")), "x");
  const original = fake.platform.fs.scanDir;
  const result = await computeDiskUsage(
    {
      scanDir: async (path, expected) => {
        const scan = await original(path, expected);
        return scan && { ...scan, unreadable: path === root ? 1 : 2 };
      },
    },
    root,
  );
  expect(result).toMatchObject({
    totalBytes: 4 * BLOCK,
    dependencyBytes: 2 * BLOCK,
    unreadable: 3,
  });
});
