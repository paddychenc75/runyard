import { absPath, isPlatformError, type WatchEvent } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import { createFakePlatform } from "./fake-platform.ts";

const dir = absPath("/lib/demo");
const file = absPath("/lib/demo/src/main.ts");

function codeOf(error: unknown): string | undefined {
  return isPlatformError(error) ? error.error.code : undefined;
}

describe("假文件系统（经 Platform.fs）", () => {
  it("writeAtomic 要求父目录已存在，写完可读回", async () => {
    const fake = createFakePlatform();
    await expect(fake.platform.fs.writeAtomic(file, "x")).rejects.toSatisfy(
      (e) => codeOf(e) === "INTERNAL",
    );
    fake.fs.mkdir(absPath("/lib/demo/src"));
    await fake.platform.fs.writeAtomic(file, "x");
    expect(fake.fs.readFile(file)).toBe("x");
    expect(fake.fs.list(dir)).toEqual(["src"]);
  });

  it("moveDir 移动整个目录；被锁住时抛 PATH_LOCKED 且原目录不变", async () => {
    const fake = createFakePlatform();
    fake.fs.writeFile(file, "x");
    fake.fs.lock(file);
    const target = absPath("/lib/renamed");
    await expect(fake.platform.fs.moveDir(dir, target)).rejects.toSatisfy(
      (e) => codeOf(e) === "PATH_LOCKED",
    );
    expect(fake.fs.exists(file)).toBe(true);
    expect(fake.fs.exists(target)).toBe(false);
    fake.fs.unlock(file);
    await fake.platform.fs.moveDir(dir, target);
    expect(fake.fs.readFile(absPath("/lib/renamed/src/main.ts"))).toBe("x");
    expect(fake.fs.exists(dir)).toBe(false);
  });

  it("trash 与 macOS 一致：整个目录进废纸篓、可放回、没有被直接删的子路径；失败时目录不变", async () => {
    const fake = createFakePlatform();
    fake.fs.writeFile(file, "x");
    fake.fs.failTrash();
    await expect(fake.platform.fs.trash(dir)).rejects.toSatisfy(
      (e) => codeOf(e) === "TRASH_UNAVAILABLE",
    );
    expect(fake.fs.exists(file)).toBe(true);
    fake.fs.failTrash(false);
    expect(await fake.platform.fs.trash(dir)).toEqual({ restorable: true, removedDirectly: [] });
    expect(fake.fs.exists(dir)).toBe(false);
    expect(fake.fs.trashed.map((entry) => entry.path)).toEqual([dir]);
  });

  it("watch 报相对路径、跳过 ignore、dispose 之后不再报", async () => {
    const fake = createFakePlatform();
    const events: WatchEvent[] = [];
    const handle = await fake.platform.watch(dir, { ignore: ["node_modules" as never] }, (batch) =>
      events.push(...batch),
    );
    fake.fs.writeFile(file, "1");
    fake.fs.writeFile(file, "2");
    fake.fs.writeFile(absPath("/lib/demo/node_modules/a.js"), "");
    fake.fs.remove(file);
    expect(events).toEqual([
      { kind: "add", path: "src/main.ts" },
      { kind: "change", path: "src/main.ts" },
      { kind: "remove", path: "src/main.ts" },
    ]);
    await handle.dispose();
    fake.fs.writeFile(file, "3");
    expect(events).toHaveLength(3);
  });
});
