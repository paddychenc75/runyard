import { join } from "node:path";
import type { PrepareOutcome, RunPlan, RunPreparer } from "@runyard/core";
import { absPath } from "@runyard/platform";
import { settle } from "@runyard/testing";
import { afterEach, describe, expect, it } from "vitest";
import { SIZE_QUIET_MS, SIZE_SWEEP_MS } from "./disk-usage-service.ts";
import { LibraryWorld, type Pump } from "./library-harness.test.ts";
import { RunWorld } from "./run-harness.test.ts";

// 磁盘占用的后台计算、缓存、触发（规格 LIBRARY-DISK-USAGE-03 到 20）。假时钟和假文件系统，没有真实等待。

const BLOCK = 4096;
type Size = {
  totalBytes: number;
  dependencyBytes: number;
  dependencyDirs: string[];
  unreadable: number;
};
type Pg = { id: string; name: string; path: string; size?: Size; missingSince?: number };

let lw = new LibraryWorld();
afterEach(() => lw.dispose());

async function setup(): Promise<Pump> {
  lw = new LibraryWorld();
  await lw.start();
  return lw.client();
}

async function quiet(): Promise<void> {
  for (let i = 0; i < 4; i++) await settle();
}

const list = (app: Pump) => app.result<Pg[]>("playground.list", {});
const find = async (app: Pump, name: string) => (await list(app)).find((p) => p.name === name);
const sizeOf = async (app: Pump, name: string) => (await find(app, name))?.size;

/** 项目根目录被读的次数 */
const scans = (name: string) => lw.fs.scanCounts.get(lw.at(name)) ?? 0;

describe("后台计算", () => {
  it("[LIBRARY-DISK-USAGE-03] 一个项目的遍历一直不结束：列出、新建照常答复，它报告为正在计算而不是 0", async () => {
    const app = await setup();
    const hung = await lw.create(app, "hung");
    await quiet();
    // 之后的遍历不结束：改成新建一个项目前先让它的根目录挂住
    lw.fs.hangScan(lw.at("late"));
    await lw.create(app, "late");
    await quiet();
    const listed = await list(app);
    expect(listed.map((p) => p.name).sort()).toEqual(["hung", "late"]);
    expect((await find(app, "late"))?.size).toBeUndefined();
    // 别的请求照常答复：再建一个、再列出
    await lw.create(app, "other");
    expect((await list(app)).length).toBe(3);
    expect(hung.playground.name).toBe("hung");
  });

  it("[LIBRARY-DISK-USAGE-04] 一次只算一个项目，五个项目最终都有结果", async () => {
    lw = new LibraryWorld();
    // 启动前资源库里已经有 5 个项目文件夹，启动时的扫描把它们都登记
    await lw.start();
    const app = await lw.client();
    for (const name of ["a", "b", "c", "d", "e"]) await lw.create(app, name);
    const order: string[] = [];
    lw.fs.onScanDir = (dir) => {
      const mine = ["a", "b", "c", "d", "e"].find((name) => dir.startsWith(lw.at(name)));
      if (mine !== undefined && order.at(-1) !== mine) order.push(mine);
    };
    await lw.clock.advance(SIZE_SWEEP_MS);
    await quiet();
    // 每个项目的目录连续读完才轮到下一个：不交错
    expect(new Set(order).size).toBe(order.length);
    expect(order.length).toBe(5);
    for (const name of ["a", "b", "c", "d", "e"]) expect(await sizeOf(app, name)).toBeDefined();
  });

  it("[LIBRARY-DISK-USAGE-05] 找不到文件夹的项目没有大小，重新定位后才计算", async () => {
    const app = await setup();
    const { playground } = await lw.create(app, "gone");
    await quiet();
    expect(await sizeOf(app, "gone")).toBeDefined();
    // 文件夹被挪到资源库之外：找不到
    lw.fs.moveDir(lw.at("gone"), absPath("/elsewhere/gone"), "gone");
    await app.result("library.rescan", {});
    await quiet();
    const missing = await find(app, "gone");
    expect(missing?.missingSince).toBeDefined();
    expect(missing?.size).toBeUndefined();
    // 重新定位之后才计算
    await app.result("playground.relocate", { playground: playground.id, path: "/elsewhere/gone" });
    await quiet();
    expect((await find(app, "gone"))?.size).toBeDefined();
  });
});

describe("缓存与触发", () => {
  it("[LIBRARY-DISK-USAGE-13] 反复请求项目列表：同一个结果，项目没有被再次遍历", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    await quiet();
    const first = await sizeOf(app, "demo");
    expect(first).toBeDefined();
    const count = scans("demo");
    for (let i = 0; i < 5; i++) expect(await sizeOf(app, "demo")).toEqual(first);
    expect(scans("demo")).toBe(count);
  });

  it("[LIBRARY-DISK-USAGE-14] 文件变化：最后一次写入后 5 秒才重算一次，期间报旧结果，之后通知客户端", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    await quiet();
    const old = await sizeOf(app, "demo");
    const count = scans("demo");
    lw.fs.writeFile(lw.at("demo", "new-1.txt"), "x");
    await lw.clock.advance(1500);
    lw.fs.writeFile(lw.at("demo", "new-2.txt"), "x");
    await lw.clock.advance(1500);
    lw.fs.writeFile(lw.at("demo", "new-3.txt"), "x");
    await lw.clock.advance(SIZE_QUIET_MS - 100);
    expect(scans("demo")).toBe(count);
    expect(await sizeOf(app, "demo")).toEqual(old);
    app.events.length = 0;
    await lw.clock.advance(200);
    await quiet();
    expect(scans("demo")).toBe(count + 1);
    const next = await sizeOf(app, "demo");
    expect(next?.totalBytes).toBe((old?.totalBytes ?? 0) + 3 * BLOCK);
    const changed = app.eventsOf("playground.changed") as Pg[];
    expect(changed.at(-1)?.size?.totalBytes).toBe(next?.totalBytes);
  });

  it("[LIBRARY-DISK-USAGE-15] 持续变化时最迟 60 秒重算一次，不是每次变化都重算", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    await quiet();
    const count = scans("demo");
    // 每 2 秒写一次，持续 3 分钟；第一次变化后 60 秒内（含）至少有一次重算
    let firstRecompute: number | undefined;
    const startedAt = lw.clock.now();
    for (let second = 0; second < 180; second += 2) {
      lw.fs.writeFile(lw.at("demo", `w-${second}.txt`), "x");
      await lw.clock.advance(2000);
      if (firstRecompute === undefined && scans("demo") > count) {
        firstRecompute = lw.clock.now() - startedAt;
      }
    }
    expect(firstRecompute).toBeDefined();
    expect(firstRecompute ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(62_000);
    // 3 分钟里最多重算 4 次，远少于 90 次变化
    expect(scans("demo") - count).toBeLessThanOrEqual(4);
  });

  it("[LIBRARY-DISK-USAGE-17] 每 30 分钟复核：node_modules 里装了新包，其余没变，依赖大小更新", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    lw.fs.writeFile(lw.at("demo", "node_modules", "a", "i.js"), "x");
    // 依赖目录不在监听范围内：装包不会触发重算，没到 30 分钟之前仍是旧值（还没有依赖）
    await lw.clock.advance(25 * 60_000);
    expect((await sizeOf(app, "demo"))?.dependencyBytes).toBe(0);
    await lw.clock.advance(10 * 60_000);
    // node_modules、a、i.js
    expect((await sizeOf(app, "demo"))?.dependencyBytes).toBe(3 * BLOCK);
  });

  it("[LIBRARY-DISK-USAGE-18] 改名保留结果，不显示正在计算", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    await quiet();
    const before = await sizeOf(app, "demo");
    expect(before).toBeDefined();
    const demo = await find(app, "demo");
    const pending = app.call("playground.rename", { playground: "demo", newName: "demo-2" });
    await app.waitForEvent("playground.releaseRequested");
    await app.call("playground.released", { playgroundId: demo?.id });
    expect(await pending).toMatchObject({ ok: true });
    expect(await sizeOf(app, "demo-2")).toEqual(before);
  });

  it("[LIBRARY-DISK-USAGE-19] 不写磁盘：之后的重算不改动任何文件；重启后先报告正在计算再得出结果", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    await quiet();
    const snapshot = () => {
      const seen = new Map<string, string | null>();
      const walk = (dir: string) => {
        for (const name of lw.fs.list(absPath(dir))) {
          const path = absPath(join(dir, name));
          const text = lw.fs.readText(path);
          if (text !== null) seen.set(path, text);
          else walk(path);
        }
      };
      walk(absPath(join(lw.world.fake.platform.paths.stateDir)));
      walk(lw.root);
      return seen;
    };
    const before = snapshot();
    await lw.clock.advance(SIZE_SWEEP_MS);
    expect(snapshot()).toEqual(before);
    // 重启：同一个文件系统上再起一个管理进程
    await lw.handle.api.shutdown("user");
    lw.fs.hangScan(lw.at("demo"));
    lw.handle = await lw.world.start({
      log: (line) => lw.logs.push(line),
      extend: () => ({ library: lw.seams() }),
    });
    const again = await lw.client();
    await quiet();
    expect((await find(again, "demo"))?.size).toBeUndefined();
  });

  it("[LIBRARY-DISK-USAGE-20] 移到废纸篓后不再有结果，客户端收到通知；另一个项目不变", async () => {
    const app = await setup();
    await lw.create(app, "one");
    await lw.create(app, "two");
    await quiet();
    const twoBefore = await sizeOf(app, "two");
    const one = await find(app, "one");
    const pending = app.call("playground.trash", { playground: "one" });
    await app.waitForEvent("playground.releaseRequested");
    await app.call("playground.released", { playgroundId: one?.id });
    expect(await pending).toMatchObject({ ok: true });
    await quiet();
    expect(app.eventsOf("playground.removed").length).toBe(1);
    expect((await list(app)).map((p) => p.name)).toEqual(["two"]);
    expect(await sizeOf(app, "two")).toEqual(twoBefore);
  });

  it("资源库根目录读不了：不报告新结果，已有的保留", async () => {
    const app = await setup();
    await lw.create(app, "demo");
    await quiet();
    const before = await sizeOf(app, "demo");
    lw.fs.denyRead(lw.root);
    lw.fs.writeFile(lw.at("demo", "more.txt"), "x");
    await lw.clock.advance(SIZE_QUIET_MS + 100);
    expect(await sizeOf(app, "demo")).toEqual(before);
  });
});

describe("运行带来的重算", () => {
  it("[LIBRARY-DISK-USAGE-16] 启动项目、依赖安装步骤结束后重算，依赖大小从 0 变为装好的占用", async () => {
    const rw = new RunWorld();
    const installing: RunPreparer = {
      prepare: async (context): Promise<PrepareOutcome> => {
        context.report("installing");
        rw.fs.writeFile(rw.at(context.request.name, "node_modules", "pkg", "i.js"), "x");
        const plan: RunPlan = {
          argv: ["node", "script.js"],
          cwd: absPath(join("/work", context.request.name)),
          env: {},
          stdin: true,
          stop: { mode: "graceful", graceMs: 2000 },
        };
        return { ok: true, plan };
      },
    };
    rw.moduleOptions = { preparer: installing };
    await rw.start();
    const app = await rw.app();
    const id = await rw.newProject(app, "demo", true);
    await quiet();
    const before = (await app.result<Pg[]>("playground.list", {})).find((p) => p.id === id);
    expect(before?.size?.dependencyBytes).toBe(0);
    await rw.drive(
      app.result("run.start", {
        playground: id,
        owner: { kind: "cli", command: "runyard run" },
        wait: "none",
      }),
    );
    await rw.until(async () => {
      const now = (await app.result<Pg[]>("playground.list", {})).find((p) => p.id === id);
      return (now?.size?.dependencyBytes ?? 0) > 0;
    });
    const after = (await app.result<Pg[]>("playground.list", {})).find((p) => p.id === id);
    // node_modules、pkg、i.js
    expect(after?.size?.dependencyBytes).toBe(3 * BLOCK);
    await rw.dispose();
  });
});
