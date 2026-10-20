import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import { afterAll, describe, expect, it } from "vitest";
import { computeDiskUsage } from "./disk-usage.ts";

// 真磁盘上的磁盘占用：硬链接、符号链接（含指向自己根目录的环）、没有读权限的文件夹（规格 LIBRARY-DISK-USAGE-07、08、11、12）
const home = realpathSync(mkdtempSync(join(tmpdir(), "ry-size-")));
afterAll(() => rmSync(home, { recursive: true, force: true }));
const platform = getPlatform({ home: absPath(home) });

describe("真磁盘上的大小", () => {
  it("[LIBRARY-DISK-USAGE-08] 读过父目录后子目录被换成外部链接：拒绝混合两份目录的结果", async () => {
    const project = absPath(join(home, "link-race"));
    const sub = join(project, "sub");
    const outside = join(home, "race-outside");
    mkdirSync(sub, { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(outside, "big"), new Uint8Array(1_000_000));
    const result = await computeDiskUsage(
      {
        scanDir: async (dir, expected) => {
          const scan = await platform.fs.scanDir(dir, expected);
          if (dir === project) {
            renameSync(sub, join(home, "race-original"));
            symlinkSync(outside, sub);
          }
          return scan;
        },
      },
      project,
    );
    expect(result).toBe("changed");
  });

  it("[LIBRARY-DISK-USAGE-08] 项目根本身是链接时保留既有行为，子链接仍不展开", async () => {
    const project = absPath(join(home, "root-target"));
    const linked = absPath(join(home, "root-link"));
    mkdirSync(project);
    writeFileSync(join(project, "file"), "x");
    symlinkSync(project, linked);
    expect(await computeDiskUsage(platform.fs, linked)).toEqual(
      await computeDiskUsage(platform.fs, project),
    );
  });

  it("[LIBRARY-DISK-USAGE-07][LIBRARY-DISK-USAGE-08][LIBRARY-DISK-USAGE-11] 硬链接只算一次，链接不跟随不绕圈，读不了的文件夹记一处", async () => {
    const project = join(home, "proj");
    const outside = join(home, "outside");
    mkdirSync(join(project, "secret"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(outside, "huge.bin"), new Uint8Array(5_000_000));
    writeFileSync(join(project, "a.bin"), new Uint8Array(1_000_000));
    linkSync(join(project, "a.bin"), join(project, "b.bin"));
    symlinkSync(outside, join(project, "big"));
    symlinkSync(project, join(project, "self"));
    writeFileSync(join(project, "secret", "hidden.txt"), "x");

    const withoutSecret = async () => {
      const result = await computeDiskUsage(platform.fs, absPath(project));
      if (typeof result === "string") throw new Error(result);
      return result;
    };
    chmodSync(join(project, "secret"), 0o000);
    let blocked: Awaited<ReturnType<typeof withoutSecret>>;
    try {
      blocked = await withoutSecret();
    } finally {
      chmodSync(join(project, "secret"), 0o755);
    }
    expect(blocked.unreadable).toBe(1);
    // 只有一份 1 MB 的数据；外面的 5 MB 没有算进来
    expect(blocked.totalBytes).toBeGreaterThanOrEqual(1_000_000);
    expect(blocked.totalBytes).toBeLessThan(1_500_000);

    const readable = await withoutSecret();
    expect(readable.unreadable).toBe(0);
    expect(readable.totalBytes).toBeGreaterThan(blocked.totalBytes);
  });

  it("[LIBRARY-DISK-USAGE-01] 依赖目录单独记，嵌套的不重复数", async () => {
    const project = join(home, "deps");
    mkdirSync(join(project, "node_modules", "pkg", "node_modules"), { recursive: true });
    mkdirSync(join(project, "web", "node_modules"), { recursive: true });
    writeFileSync(join(project, "index.js"), "x");
    writeFileSync(join(project, "node_modules", "pkg", "node_modules", "d.js"), "x");
    writeFileSync(join(project, "web", "node_modules", "w.js"), "x");
    const result = await computeDiskUsage(platform.fs, absPath(project));
    if (typeof result === "string") throw new Error(result);
    expect(result.dependencyDirs).toEqual(["node_modules"]);
    expect(result.dependencyBytes).toBeGreaterThan(0);
    expect(result.totalBytes).toBeGreaterThan(result.dependencyBytes);
  });
});
