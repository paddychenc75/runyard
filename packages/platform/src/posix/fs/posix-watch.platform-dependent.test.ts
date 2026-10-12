import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eventually } from "../../contract/service-harness.ts";
import { absPath } from "../../path-types.ts";
import type { WatchEvent } from "../../platform.ts";
import { makeSandbox, type Sandbox } from "../../test-support/trash-sandbox.ts";
import { watchPosix } from "./posix-watch.ts";

// 监听句柄的释放：dispose 返回后底层句柄已关闭，调用方可以立刻改名或移走被监听的目录（技术设计 §6.4）。

let box: Sandbox;
beforeEach(() => {
  box = makeSandbox();
});
afterEach(() => box.remove());

const watcherHandles = () =>
  process.getActiveResourcesInfo().filter((name) => name === "FSEventWrap").length;

describe("watch 句柄", () => {
  it("dispose 返回后系统的监听句柄已全部交还，随即改名被监听的目录也不受影响", async () => {
    mkdirSync(box.at("root", "sub"), { recursive: true });
    const before = watcherHandles();
    const seen: WatchEvent[] = [];
    const handle = await watchPosix(absPath(box.at("root")), {}, (events) => seen.push(...events));
    expect(watcherHandles()).toBeGreaterThan(before);
    writeFileSync(box.at("root", "sub", "a.txt"), "1");
    await eventually(() => seen.length > 0, 30_000, "第一个事件");
    await handle.dispose();
    expect(watcherHandles()).toBe(before);
    renameSync(box.at("root"), box.at("renamed"));
    expect(seen.every((event) => !event.path.startsWith("renamed"))).toBe(true);
  });

  it("同一个文件连着几次系统事件，一批里不重复报同样的事件", async () => {
    mkdirSync(box.at("root"));
    const batches: WatchEvent[][] = [];
    const handle = await watchPosix(absPath(box.at("root")), {}, (events) => batches.push(events));
    writeFileSync(box.at("root", "a.txt"), "1");
    writeFileSync(box.at("root", "a.txt"), "2");
    await eventually(() => batches.length > 0, 30_000, "一批事件");
    await handle.dispose();
    const adds = batches.flat().filter((event) => event.kind === "add" && event.path === "a.txt");
    expect(adds).toHaveLength(1);
  });
});
