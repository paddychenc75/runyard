import { mkdirSync, writeFileSync } from "node:fs";
import { relative, sep } from "node:path";
import type { FSWatcher } from "chokidar";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventually } from "../../contract/service-harness.ts";
import { absPath, posixRelPath } from "../../path-types.ts";
import type { WatchEvent } from "../../platform.ts";
import { makeSandbox, type Sandbox } from "../../test-support/trash-sandbox.ts";
import { watchPosix } from "./posix-watch.ts";

// 保留真实 chokidar，只保留创建出的对象供断言实际监听集合，不给产品接口加测试入口。
const watchers = vi.hoisted(() => [] as FSWatcher[]);
vi.mock("chokidar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("chokidar")>();
  return {
    ...actual,
    watch: (...args: Parameters<typeof actual.watch>) => {
      const watcher = actual.watch(...args);
      watchers.push(watcher);
      return watcher;
    },
  };
});
let box: Sandbox;
beforeEach(() => {
  box = makeSandbox();
});
afterEach(() => box.remove());

it("[#472] 真实 getWatched 不含根与嵌套依赖子树，后创建的依赖也不建立监听，源码照常报告", async () => {
  // root 的祖先恰好同名，不能误把整个项目排除。
  const root = absPath(box.at("node_modules", "project"));
  const under = (...parts: string[]) => box.at("node_modules", "project", ...parts);
  for (const parts of [
    ["node_modules", "pkg"],
    [".venv", "lib"],
    ["web", "node_modules", "pkg"],
    ["apps", "api", ".venv", "lib"],
    ["web", "src"],
    ["web", "node_modules-old"],
    [".runyard"],
    ["web", ".runyard"],
  ]) {
    mkdirSync(under(...parts), { recursive: true });
    writeFileSync(under(...parts, "index.txt"), "1");
  }
  const seen: WatchEvent[] = [];
  const handle = await watchPosix(
    root,
    { ignore: [posixRelPath(".runyard")], ignoreNames: ["node_modules", ".venv"] },
    (events) => seen.push(...events),
  );
  try {
    const watchedPaths = () =>
      Object.keys(watchers.at(-1)?.getWatched() ?? {})
        .filter((path) => path.startsWith(root + sep))
        .map((path) => relative(root, path).split(sep).join("/"));
    const ignored = (path: string) =>
      path.split("/").some((part) => part === "node_modules" || part === ".venv");
    expect(watchedPaths()).toEqual(
      expect.arrayContaining(["web/src", "web/node_modules-old", "web/.runyard"]),
    );
    expect(watchedPaths().filter(ignored)).toEqual([]);
    expect(watchedPaths()).not.toContain(".runyard");
    mkdirSync(under("web", "src", "node_modules", "new-package"), { recursive: true });
    writeFileSync(under("web", "src", "node_modules", "new-package", "index.js"), "1");
    writeFileSync(under("web", "src", "sentinel.ts"), "1");
    await eventually(
      () => seen.some((event) => event.path === "web/src/sentinel.ts"),
      30_000,
      "普通源码的哨兵事件",
    );
    expect(watchedPaths().filter(ignored)).toEqual([]);
    expect(seen.filter((event) => ignored(event.path))).toEqual([]);
  } finally {
    await handle.dispose();
  }
});
