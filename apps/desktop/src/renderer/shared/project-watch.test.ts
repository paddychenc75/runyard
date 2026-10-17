import { describe, expect, it } from "vitest";
import type { DesktopBridge, DesktopEvents } from "../../shared/desktop-bridge.ts";
import { watchProject } from "./project-watch.ts";

function fakeBridge() {
  const calls: string[] = [];
  const listeners = new Set<(payload: DesktopEvents["files.changed"]) => void>();
  const bridge = {
    call: async (method: string, param: { project: string }) => {
      calls.push(`${method}:${param.project}`);
    },
    on: (_event: string, listener: (payload: DesktopEvents["files.changed"]) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as DesktopBridge;
  return {
    bridge,
    calls,
    emit: (p: DesktopEvents["files.changed"]) => {
      for (const l of listeners) l(p);
    },
  };
}

describe("项目文件夹的监听计数", () => {
  it("文件树和编辑会话各订阅一次：先关的那个不会把另一个的监听停掉，最后一个关了才 unwatch", () => {
    const { bridge, calls } = fakeBridge();
    const stopTree = watchProject(bridge, "demo", () => {});
    const stopSession = watchProject(bridge, "demo", () => {});
    stopTree();
    expect(calls.filter((call) => call.startsWith("files.unwatch"))).toEqual([]);
    stopSession();
    expect(calls.filter((call) => call.startsWith("files.unwatch"))).toEqual([
      "files.unwatch:demo",
    ]);
  });

  it("只把自己项目的变化交给监听者；取消订阅后不再收到；重复取消不会多减一次", () => {
    const { bridge, calls, emit } = fakeBridge();
    const seen: string[] = [];
    const stop = watchProject(bridge, "demo", (payload) => seen.push(payload.project));
    const other = watchProject(bridge, "demo", () => {});
    emit({ project: "demo", changes: [] });
    emit({ project: "other", changes: [] });
    expect(seen).toEqual(["demo"]);
    stop();
    stop();
    emit({ project: "demo", changes: [] });
    expect(seen).toEqual(["demo"]);
    expect(calls.filter((call) => call.startsWith("files.unwatch"))).toEqual([]);
    other();
    expect(calls.filter((call) => call.startsWith("files.unwatch"))).toHaveLength(1);
  });

  it("不同项目各算各的", () => {
    const { bridge, calls } = fakeBridge();
    const a = watchProject(bridge, "a", () => {});
    const b = watchProject(bridge, "b", () => {});
    a();
    expect(calls).toContain("files.unwatch:a");
    expect(calls).not.toContain("files.unwatch:b");
    b();
  });
});
