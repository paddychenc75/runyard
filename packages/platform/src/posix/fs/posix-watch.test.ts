import { EventEmitter } from "node:events";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { absPath, posixRelPath } from "../../path-types.ts";
import { watchPosix } from "./posix-watch.ts";

const captured = vi.hoisted(() => ({
  ignored: undefined as ((path: string) => boolean) | undefined,
}));
vi.mock("chokidar", () => ({
  watch: (_root: string, options: { ignored: (path: string) => boolean }) => {
    captured.ignored = options.ignored;
    const events = Object.assign(new EventEmitter(), { close: async () => {} });
    queueMicrotask(() => events.emit("ready"));
    return events;
  },
}));
afterEach(() => vi.useRealTimers());

describe("chokidar 遍历前的忽略条件", () => {
  it("[#472] 名称忽略传给底层：根和任意层级的依赖目录及内容都被剪枝", async () => {
    vi.useFakeTimers();
    const root = absPath(join("/sandbox", "node_modules", "demo"));
    const pending = watchPosix(
      root,
      {
        ignore: [posixRelPath("node_modules"), posixRelPath(".venv")],
        ignoreNames: ["node_modules", ".venv"],
      },
      () => {},
    );
    const ignored = captured.ignored;
    expect(ignored).toBeDefined();
    try {
      expect(ignored?.(root)).toBe(false);
      expect(ignored?.(join(root, "node_modules"))).toBe(true);
      expect(ignored?.(join(root, "web", "node_modules"))).toBe(true);
      expect(ignored?.(join(root, "web", "node_modules", "pkg", "index.js"))).toBe(true);
      expect(ignored?.(join(root, "apps", "api", ".venv", "lib"))).toBe(true);
      expect(ignored?.(join(root, "web", "node_modules-old", "index.js"))).toBe(false);
      expect(ignored?.(join(root, "apps", "api", "src", "main.py"))).toBe(false);
    } finally {
      await vi.advanceTimersByTimeAsync(100);
      const handle = await pending;
      const closing = handle.dispose();
      await vi.advanceTimersByTimeAsync(10);
      await closing;
    }
  });

  it("[#472] 原有 ignore 仍只认根相对路径，不把同名嵌套路径排除", async () => {
    vi.useFakeTimers();
    const root = absPath(join("/sandbox", "demo"));
    const pending = watchPosix(root, { ignore: [posixRelPath("node_modules")] }, () => {});
    try {
      expect(captured.ignored?.(join(root, "node_modules", "index.js"))).toBe(true);
      expect(captured.ignored?.(join(root, "web", "node_modules", "index.js"))).toBe(false);
    } finally {
      await vi.advanceTimersByTimeAsync(100);
      const handle = await pending;
      const closing = handle.dispose();
      await vi.advanceTimersByTimeAsync(10);
      await closing;
    }
  });
});
