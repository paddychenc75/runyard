import { join } from "node:path";
import { absPath } from "@runyard/platform";
import { createFakePlatform } from "@runyard/testing";
import { expect, it, vi } from "vitest";
import { createDiskUsageService, SIZE_QUIET_MS, SIZE_SWEEP_MS } from "./disk-usage-service.ts";

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

it("[LIBRARY-DISK-USAGE-11] 遍历结束前资源库根变为不可读：保留旧结果，不发布新大小", async () => {
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
    fake.fs.writeFile(absPath(join(project, "new")), "x");
    const original = fake.platform.fs.scanDir;
    vi.spyOn(fake.platform.fs, "scanDir").mockImplementation(async (dir, expected) => {
      const scan = await original(dir, expected);
      if (dir === project) fake.fs.denyRead(root);
      return scan;
    });
    service.refresh("p");
    await service.idle();
    expect(service.get("p")).toEqual(before);
    expect(changed).toHaveBeenCalledTimes(1);
  } finally {
    await service.dispose();
  }
});

it("[LIBRARY-DISK-USAGE-14] [LIBRARY-DISK-USAGE-16] [LIBRARY-DISK-USAGE-17] 嵌套依赖在平台层不发事件，源码仍防抖，刷新与定期复核补齐依赖大小 [#472]", async () => {
  const fake = createFakePlatform();
  const root = absPath(join("/library"));
  const project = absPath(join(root, "demo"));
  fake.fs.mkdir(absPath(join(project, "web")));
  fake.fs.mkdir(absPath(join(project, "apps", "api")));
  const delivered: string[] = [];
  const originalWatch = fake.platform.watch;
  const watches = vi.spyOn(fake.platform, "watch").mockImplementation((path, options, callback) =>
    originalWatch(path, options, (events) => {
      delivered.push(...events.map((event) => event.path));
      callback(events);
    }),
  );
  const service = createDiskUsageService(
    { platform: fake.platform, clock: fake.clock },
    { onChange: vi.fn(), log: vi.fn() },
  );
  const scanCount = () => fake.fs.scanCounts.get(project);
  try {
    service.sync(root, [{ id: "p", path: project, missing: false }]);
    await service.idle();
    expect(watches.mock.calls[0]?.[1]).toEqual({
      ignore: [".runyard"],
      ignoreNames: ["node_modules", ".venv"],
    });
    const count = scanCount();
    fake.fs.writeFile(absPath(join(project, "web", "node_modules", "pkg", "index.js")), "x");
    fake.fs.writeFile(absPath(join(project, "apps", "api", ".venv", "lib", "index.py")), "x");
    await fake.clock.advance(SIZE_QUIET_MS);
    await service.idle();
    expect(delivered).toEqual([]);
    expect(scanCount()).toBe(count);
    expect(service.get("p")?.dependencyBytes).toBe(0);
    service.refresh("p");
    await service.idle();
    const dependencyBytes = service.get("p")?.dependencyBytes ?? 0;
    expect(dependencyBytes).toBeGreaterThan(0);
    fake.fs.writeFile(absPath(join(project, "apps", "api", ".venv", "lib", "new.py")), "x");
    await fake.clock.advance(SIZE_SWEEP_MS);
    await service.idle();
    expect(service.get("p")?.dependencyBytes).toBeGreaterThan(dependencyBytes);
    const beforeSource = scanCount();
    fake.fs.writeFile(absPath(join(project, "web", "main.ts")), "x");
    expect(delivered).toEqual(["web/main.ts"]);
    await fake.clock.advance(SIZE_QUIET_MS - 1);
    expect(scanCount()).toBe(beforeSource);
    await fake.clock.advance(1);
    await service.idle();
    expect(scanCount()).toBe((beforeSource ?? 0) + 1);
  } finally {
    await service.dispose();
  }
});

it("[LIBRARY-DISK-USAGE-18] 释放监听等待底层关闭，保留缓存，同路径恢复后重新监听", async () => {
  const fake = createFakePlatform();
  const root = absPath(join("/library"));
  const project = absPath(join(root, "demo"));
  fake.fs.mkdir(project);
  let release = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const close = vi.fn(() => blocked);
  const watches = vi.spyOn(fake.platform, "watch").mockResolvedValue({ dispose: close });
  const service = createDiskUsageService(
    { platform: fake.platform, clock: fake.clock },
    { onChange: vi.fn(), log: vi.fn() },
  );
  service.sync(root, [{ id: "p", path: project, missing: false }]);
  await service.idle();
  const before = service.get("p");
  const pause = service.pause("p");
  let finished = false;
  void pause.then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
  expect(finished).toBe(false);
  expect(service.get("p")).toEqual(before);
  release();
  await pause;
  service.sync(root, [{ id: "p", path: project, missing: false }]);
  await service.idle();
  expect(watches).toHaveBeenCalledTimes(2);
  await service.dispose();
});

it("[LIBRARY-DISK-USAGE-20] 移除项正在释放监听时退出仍等待该次释放", async () => {
  const fake = createFakePlatform();
  const root = absPath(join("/library"));
  const project = absPath(join(root, "demo"));
  fake.fs.mkdir(project);
  let release = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(fake.platform, "watch").mockResolvedValue({ dispose: () => blocked });
  const service = createDiskUsageService(
    { platform: fake.platform, clock: fake.clock },
    { onChange: vi.fn(), log: vi.fn() },
  );
  service.sync(root, [{ id: "p", path: project, missing: false }]);
  await service.idle();
  service.sync(root, []);
  let finished = false;
  const done = service.dispose().then(() => {
    finished = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(finished).toBe(false);
  release();
  await done;
});

it("[LIBRARY-DISK-USAGE-20] 已移除项释放失败不能让退出假成功，仍等另一项释放结束", async () => {
  const fake = createFakePlatform();
  const root = absPath(join("/library"));
  const first = absPath(join(root, "first"));
  const second = absPath(join(root, "second"));
  fake.fs.mkdir(first);
  fake.fs.mkdir(second);
  let release = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(fake.platform, "watch").mockImplementation(async (path) => ({
    dispose: () => (path === first ? Promise.reject(new Error("close failed")) : blocked),
  }));
  const service = createDiskUsageService(
    { platform: fake.platform, clock: fake.clock },
    { onChange: vi.fn(), log: vi.fn() },
  );
  service.sync(root, [
    { id: "a", path: first, missing: false },
    { id: "b", path: second, missing: false },
  ]);
  await service.idle();
  service.sync(root, []);
  let finished = false;
  const done = service.dispose();
  void done.then(
    () => {
      finished = true;
    },
    () => {
      finished = true;
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(finished).toBe(false);
  release();
  await expect(done).rejects.toThrow("disk watcher release failed");
});
