import { join } from "node:path";
import { absPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { expect, it, vi } from "vitest";
import { createDiskUsageService, SIZE_QUIET_MS } from "./disk-usage-service.ts";

it("[LIBRARY-DISK-USAGE-18] 重算停在旧路径时改名：旧扫描不清空缓存，新路径继续重算", async () => {
  const fake = createFakePlatform();
  const root = absPath(join("/library"));
  const old = absPath(join(root, "demo"));
  const next = absPath(join(root, "demo-2"));
  fake.fs.mkdir(old);
  fake.fs.writeFile(absPath(join(old, "file")), "x");
  const changed = vi.fn();
  const service = createDiskUsageService(
    { platform: fake.platform, clock: fake.clock },
    { onChange: () => changed(service.get("p")), log: vi.fn() },
  );
  try {
    service.sync(root, [{ id: "p", path: old, missing: false }]);
    await service.idle();
    const before = service.get("p");
    expect(before).toBeDefined();
    let enter = () => {};
    let release = () => {};
    const started = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = fake.platform.fs.scanDir;
    const scans = vi.spyOn(fake.platform.fs, "scanDir").mockImplementation(async (dir) => {
      if (dir === old) {
        enter();
        await blocked;
      }
      return original(dir);
    });
    service.refresh("p");
    await started;
    fake.fs.moveDir(old, next, "demo-2");
    service.sync(root, [{ id: "p", path: next, missing: false }]);
    expect(service.get("p")).toEqual(before);
    release();
    await service.idle();
    expect(service.get("p")).toEqual(before);
    expect(scans).toHaveBeenCalledWith(next);
    expect(changed.mock.calls.every(([size]) => size !== undefined)).toBe(true);
  } finally {
    await service.dispose();
  }
});

it("[LIBRARY-DISK-USAGE-14] 遍历中目录被替换：保留旧缓存，安静五秒后重算，再通知客户端", async () => {
  const fake = createFakePlatform();
  const root = absPath(join("/library"));
  const project = absPath(join(root, "demo"));
  fake.fs.mkdir(project);
  const changed = vi.fn();
  const service = createDiskUsageService(
    { platform: fake.platform, clock: fake.clock },
    { onChange: changed, log: vi.fn() },
  );
  try {
    service.sync(root, [{ id: "p", path: project, missing: false }]);
    await service.idle();
    const before = service.get("p");
    const original = fake.platform.fs.scanDir;
    let replaced = false;
    const scans = vi
      .spyOn(fake.platform.fs, "scanDir")
      .mockImplementation(async (dir, expected) => {
        const scan = await original(dir, expected);
        if (dir !== project || replaced || scan === null) return scan;
        replaced = true;
        return { ...scan, entries: [], changed: true };
      });
    service.refresh("p");
    await service.idle();
    expect(service.get("p")).toEqual(before);
    expect(changed).toHaveBeenCalledTimes(1);
    const count = scans.mock.calls.length;
    fake.fs.writeFile(absPath(join(project, "new")), "x");
    await fake.clock.advance(SIZE_QUIET_MS - 1);
    expect(scans).toHaveBeenCalledTimes(count);
    await fake.clock.advance(1);
    await service.idle();
    expect(service.get("p")?.totalBytes).toBeGreaterThan(before?.totalBytes ?? 0);
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    await service.dispose();
  }
});
