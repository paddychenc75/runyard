import { describe, expect, it, vi } from "vitest";
import { createEditorRelease } from "./editor-release.ts";

// 改名、移到废纸篓时编辑器那一份：写入、放监听、接回监听（规格 DESKTOP-EDITOR-75；技术设计 §6.4）

function setup(watching: string[]) {
  const timeline: string[] = [];
  const active = new Set(watching);
  const files = {
    isWatching: (id: string) => active.has(id),
    unwatch: async (id: string) => {
      active.delete(id);
      timeline.push(`unwatch(${id})`);
    },
    watch: async (id: string) => {
      active.add(id);
      timeline.push(`watch(${id})`);
      return { ok: true as const, value: null };
    },
  };
  const gate = {
    request: async (id: string, ask: boolean) => {
      timeline.push(`flush(${id},ask=${ask})`);
      return true;
    },
  };
  return { release: createEditorRelease(files as never, gate), timeline };
}

describe("编辑器的释放", () => {
  it("[DESKTOP-EDITOR-75] 放掉时正在监听的项目，改名做完后接回监听；写入请求原样交给关口", async () => {
    const { release, timeline } = setup(["a"]);
    expect(await release.flush("a", true)).toBe(true);
    await release.release("a", "rename");
    await release.restore("a");
    expect(timeline).toEqual(["flush(a,ask=true)", "unwatch(a)", "watch(a)"]);
  });

  it("本来就没在监听的项目，改名后不凭空开监听；接回只做一次", async () => {
    const { release, timeline } = setup([]);
    await release.release("b", "rename");
    await release.restore("b");
    expect(timeline).toEqual(["unwatch(b)"]);
    const again = setup(["c"]);
    await again.release.release("c", "trash");
    await again.release.restore("c");
    await again.release.restore("c");
    expect(again.timeline).toEqual(["unwatch(c)", "watch(c)"]);
  });
});

it("[DESKTOP-EDITOR-91] 改名、移到废纸篓和关闭标签都释放语言服务", async () => {
  const close = vi.fn(async () => {});
  const files = { isWatching: () => false, unwatch: async () => {}, watch: async () => {} };
  const gate = { request: async () => true };
  const release = createEditorRelease(files as never, gate, { close });
  await release.release("a", "rename");
  await release.release("b", "trash");
  await release.closed?.("c");
  expect(close.mock.calls).toEqual([["a"], ["b"], ["c"]]);
});
