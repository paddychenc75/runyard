import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorSession } from "./editor-session.ts";
import { emitChanges, fakeDisk, fakeMemory, filesOn } from "./test-files.ts";

// 自动保存和外部监听往返时编辑器内容不被动、不多写盘（#310、#319）。计时用假时钟。

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const ms = (n: number) => vi.advanceTimersByTimeAsync(n);
const PATH = "src/App.vue";
const tabOf = (session: EditorSession) => session.getState().tabs.find((tab) => tab.path === PATH);

async function setup(content = "<template>\n  <p>a</p>\n</template>\n") {
  const disk = fakeDisk({ [PATH]: content });
  const session = new EditorSession({
    files: filesOn(disk),
    memory: fakeMemory(),
    autosave: () => "delay",
  });
  await session.start(PATH);
  return { disk, session };
}

describe("自动保存往返后标签不变", () => {
  it("[DESKTOP-EDITOR-36] 输入、停 1 秒自动保存、自己写的变化回来：文本不变、不重读磁盘、不再写第二次", async () => {
    const { disk, session } = await setup();
    session.edit(PATH, "<template>\n  <p>ab</p>\n</template>\n");
    await ms(1000);
    const readsAfterSave = disk.reads.length;
    const writes = disk.writes.length;
    await ms(10_000);
    expect(writes).toBe(1);
    expect(disk.writes).toHaveLength(1);
    expect(disk.reads).toHaveLength(readsAfterSave);
    expect(tabOf(session)).toMatchObject({
      text: "<template>\n  <p>ab</p>\n</template>\n",
      saving: false,
    });
  });

  it("[DESKTOP-EDITOR-36] 磁盘内容与编辑器已保存的一致、事件却没标成自己写的（重复事件）：忽略，文本不变", async () => {
    const { disk, session } = await setup();
    session.edit(PATH, "x");
    await ms(1000);
    const before = tabOf(session);
    emitChanges(disk, [{ kind: "change", path: PATH, self: false }]);
    await ms(0);
    expect(tabOf(session)?.text).toBe(before?.text);
    expect(disk.writes).toHaveLength(1);
  });

  it("[DESKTOP-EDITOR-31] 读磁盘的过程中自己又存了一次：读到的是更早的内容，不能拿它换掉刚输入的", async () => {
    const disk = fakeDisk({ [PATH]: "v0" });
    const base = filesOn(disk);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let slow = false;
    const session = new EditorSession({
      files: {
        ...base,
        async read(path) {
          const snapshot = await base.read(path);
          if (slow) await gate;
          return snapshot;
        },
      },
      memory: fakeMemory(),
      autosave: () => "delay",
    });
    await session.start(PATH);
    slow = true;
    // 一个没标成自己的事件触发重读；读完之前用户输入并自动保存了 v1
    emitChanges(disk, [{ kind: "change", path: PATH, self: false }]);
    await ms(0);
    session.edit(PATH, "v1");
    await ms(1000);
    expect(disk.files.get(PATH)).toMatchObject({ content: "v1" });
    release();
    await ms(0);
    expect(tabOf(session)).toMatchObject({ text: "v1", savedText: "v1", conflict: false });
  });
});

describe("输入法组词与规范化", () => {
  it("[DESKTOP-EDITOR-23] 输入法组词期间不自动保存半截拼音；组词结束后停 1 秒才写", async () => {
    const { disk, session } = await setup("hi\n");
    session.setComposing(PATH, true);
    session.edit(PATH, "hinihao\n");
    await ms(5000);
    expect(disk.writes).toEqual([]);
    session.edit(PATH, "hi你好\n");
    session.setComposing(PATH, false);
    await ms(999);
    expect(disk.writes).toEqual([]);
    await ms(1);
    expect(disk.writes).toEqual([{ path: PATH, content: "hi你好\n", eol: "lf" }]);
  });

  it("[DESKTOP-EDITOR-23] 编辑器规范化了换进去的内容：会话采用它，标签不变脏，不写盘", async () => {
    const { disk, session } = await setup("a\rb\r");
    session.adoptNormalized(PATH, "a\nb\n");
    await ms(5000);
    expect(disk.writes).toEqual([]);
    expect(tabOf(session)).toMatchObject({ text: "a\nb\n", savedText: "a\nb\n" });
  });

  it("[DESKTOP-EDITOR-23] 有未保存修改时不采用规范化（不丢用户的输入）", async () => {
    const { session } = await setup("a\n");
    session.edit(PATH, "ab\n");
    session.adoptNormalized(PATH, "zzz");
    expect(tabOf(session)?.text).toBe("ab\n");
  });
});
