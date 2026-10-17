import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorSession } from "./editor-session.ts";
import type { AutosaveMode } from "./session-types.ts";
import {
  emitChanges,
  externalRemove,
  externalWrite,
  fakeDisk,
  fakeMemory,
  filesOn,
} from "./test-files.ts";

// 文件被外部修改或删除（规格 desktop/editor「文件被外部修改」）。计时用假时钟。

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup(files: Parameters<typeof fakeDisk>[0], autosave: AutosaveMode = "delay") {
  const disk = fakeDisk(files);
  const session = new EditorSession({
    files: filesOn(disk),
    memory: fakeMemory(),
    autosave: () => autosave,
  });
  await session.start("src/App.tsx");
  return { disk, session };
}

const ms = (n: number) => vi.advanceTimersByTimeAsync(n);
const tabOf = (session: EditorSession, path = "src/App.tsx") =>
  session.getState().tabs.find((tab) => tab.path === path);
const twenty = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");

describe("没有未保存修改时被外部修改", () => {
  it("[DESKTOP-EDITOR-31] 直接换成磁盘上的内容，不询问", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "old" });
    externalWrite(disk, "src/App.tsx", twenty);
    await ms(0);
    expect(tabOf(session)).toMatchObject({ text: twenty, savedText: twenty, conflict: false });
    expect(session.getState().closePrompt).toBeNull();
  });

  it("[DESKTOP-EDITOR-31] 磁盘内容就是编辑器已有的（只是被 touch）：不动", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "same" });
    const before = tabOf(session);
    emitChanges(disk, [{ kind: "change", path: "src/App.tsx", self: false }]);
    await ms(0);
    expect(tabOf(session)).toBe(before);
  });

  it("没打开的文件、不是文本的标签被改了：不理会", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "a", "other.ts": "o" });
    disk.reads.length = 0;
    externalWrite(disk, "other.ts", "o2");
    await ms(0);
    expect(disk.reads).toEqual([]);
    expect(session.getState().tabs).toHaveLength(1);
  });
});

describe("有未保存修改时被外部修改", () => {
  async function conflicted(autosave: AutosaveMode = "delay") {
    const ctx = await setup({ "src/App.tsx": "old" }, autosave);
    ctx.session.edit("src/App.tsx", "我的修改");
    // 在自动保存之前，命令行改写了文件
    externalWrite(ctx.disk, "src/App.tsx", "命令行写的");
    await ms(0);
    return ctx;
  }

  it("[DESKTOP-EDITOR-32] 出现提示；等 3 秒，磁盘仍是命令行写的，编辑器仍是我的修改", async () => {
    const { session, disk } = await conflicted();
    expect(tabOf(session)).toMatchObject({ conflict: true, text: "我的修改" });
    await ms(3000);
    expect(disk.writes).toEqual([]);
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "命令行写的" });
    expect(tabOf(session)?.text).toBe("我的修改");
  });

  it("[DESKTOP-EDITOR-32] 提示期间继续输入也不自动保存；⌘S 不覆盖磁盘上的新内容", async () => {
    const { session, disk } = await conflicted();
    session.edit("src/App.tsx", "我的修改2");
    await ms(3000);
    expect(await session.save("src/App.tsx")).toBe(false);
    expect(disk.writes).toEqual([]);
    expect(tabOf(session)?.conflict).toBe(true);
  });

  it("[DESKTOP-EDITOR-32] 提示出现后磁盘又被改：仍是同一个提示，不覆盖", async () => {
    const { session, disk } = await conflicted();
    externalWrite(disk, "src/App.tsx", "命令行又写了");
    await ms(0);
    expect(tabOf(session)).toMatchObject({ conflict: true, text: "我的修改" });
    expect(disk.writes).toEqual([]);
  });

  it("[DESKTOP-EDITOR-33] 选“用磁盘上的版本”：换成磁盘内容，未保存标记和提示消失，之后自动保存照常", async () => {
    const { session, disk } = await conflicted();
    await session.useDisk("src/App.tsx");
    expect(tabOf(session)).toMatchObject({
      text: "命令行写的",
      savedText: "命令行写的",
      conflict: false,
    });
    session.edit("src/App.tsx", "之后的修改");
    await ms(1000);
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "之后的修改" });
  });

  it("[DESKTOP-EDITOR-34] 选“保留我的修改”：我的内容写入磁盘，提示消失，状态是已保存", async () => {
    const { session, disk } = await conflicted();
    await session.keepMine("src/App.tsx");
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "我的修改" });
    expect(tabOf(session)).toMatchObject({
      conflict: false,
      saveError: null,
      text: "我的修改",
      savedText: "我的修改",
    });
  });

  it("[DESKTOP-EDITOR-34] 保留我的修改但写入失败：提示不再出现，内容和未保存标记都在", async () => {
    const { session, disk } = await conflicted();
    disk.failNextWrite = "permission";
    await session.keepMine("src/App.tsx");
    expect(tabOf(session)).toMatchObject({ conflict: false, saveError: "permission" });
    expect(tabOf(session)?.text).toBe("我的修改");
  });

  it("未保存的修改恰好和磁盘新内容相同：不算冲突，直接记为已保存", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "old" });
    session.edit("src/App.tsx", "一样的");
    externalWrite(disk, "src/App.tsx", "一样的");
    await ms(0);
    expect(tabOf(session)).toMatchObject({ conflict: false, savedText: "一样的" });
  });

  it("读磁盘的过程中又输入了：以读完那一刻的状态判断，当成冲突而不是把新输入替换掉", async () => {
    const disk = fakeDisk({ "src/App.tsx": "old" });
    const base = filesOn(disk);
    let hold: Promise<void> | null = null;
    const session = new EditorSession({
      files: {
        ...base,
        read: async (path) => {
          const result = await base.read(path);
          await hold;
          return result;
        },
      },
      memory: fakeMemory(),
      autosave: () => "delay",
    });
    await session.start("src/App.tsx");
    let release: () => void = () => {};
    hold = new Promise<void>((resolve) => (release = resolve));
    externalWrite(disk, "src/App.tsx", "命令行写的");
    await ms(0);
    session.edit("src/App.tsx", "读的时候新输入的");
    release();
    await ms(0);
    expect(tabOf(session)).toMatchObject({ conflict: true, text: "读的时候新输入的" });
  });

  it("关闭档同样：不覆盖磁盘，出现提示", async () => {
    const { session } = await conflicted("off");
    expect(tabOf(session)?.conflict).toBe(true);
  });

  it("等用户选择的文件关闭前要问：选“保存”是明确要覆盖，写入后继续", async () => {
    const { session, disk } = await conflicted();
    const outcome = session.flushForClose();
    await ms(0);
    expect(session.getState().closePrompt).toBe("src/App.tsx");
    await session.answerClose("save");
    expect(await outcome).toBe(true);
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "我的修改" });
  });
});

describe("外部删除", () => {
  it("[DESKTOP-EDITOR-35] 标签保留并标“已删除”，内容还在；改动后等 3 秒磁盘上仍没有这个文件；⌘S 后文件重新出现、标记消失", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "x", "src/old.ts": "old" });
    await session.openFile("src/old.ts");
    externalRemove(disk, "src/old.ts");
    await ms(0);
    expect(tabOf(session, "src/old.ts")).toMatchObject({ deleted: true, text: "old" });
    expect(session.getState().tabs.map((tab) => tab.path)).toContain("src/old.ts");

    session.edit("src/old.ts", "old edited");
    await ms(3000);
    expect(disk.files.has("src/old.ts")).toBe(false);
    expect(tabOf(session, "src/old.ts")).toMatchObject({ deleted: true, text: "old edited" });

    expect(await session.save("src/old.ts")).toBe(true);
    expect(disk.files.get("src/old.ts")).toMatchObject({ content: "old edited" });
    expect(tabOf(session, "src/old.ts")).toMatchObject({ deleted: false, savedText: "old edited" });
  });

  it("[DESKTOP-EDITOR-35] 没有改动过的已删除标签，⌘S 也重新创建它", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "keep me" });
    externalRemove(disk, "src/App.tsx");
    await ms(0);
    expect(tabOf(session)?.deleted).toBe(true);
    await session.save("src/App.tsx");
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "keep me" });
    expect(tabOf(session)?.deleted).toBe(false);
  });

  it("删除事件但文件其实还在（替换式保存先删再建）：不标已删除，按内容走", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "old" });
    disk.files.set("src/App.tsx", { kind: "text", content: "新内容" });
    emitChanges(disk, [{ kind: "remove", path: "src/App.tsx", self: false }]);
    await ms(0);
    expect(tabOf(session)).toMatchObject({ deleted: false, text: "新内容" });
  });

  it("已删除的文件又被外部建出来：没改过就换成新内容，改过就提示", async () => {
    const clean = await setup({ "src/App.tsx": "old" });
    externalRemove(clean.disk, "src/App.tsx");
    await ms(0);
    externalWrite(clean.disk, "src/App.tsx", "回来了");
    await ms(0);
    expect(tabOf(clean.session)).toMatchObject({ deleted: false, text: "回来了" });

    const edited = await setup({ "src/App.tsx": "old" });
    externalRemove(edited.disk, "src/App.tsx");
    await ms(0);
    edited.session.edit("src/App.tsx", "我的");
    externalWrite(edited.disk, "src/App.tsx", "回来了");
    await ms(0);
    expect(tabOf(edited.session)).toMatchObject({ deleted: false, conflict: true, text: "我的" });
  });

  it("已删除且有修改的标签关闭前要问（自动保存不会重新创建它）", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "old" });
    externalRemove(disk, "src/App.tsx");
    await ms(0);
    session.edit("src/App.tsx", "我的");
    await session.requestClose("src/App.tsx");
    expect(session.getState().closePrompt).toBe("src/App.tsx");
    expect(disk.writes).toEqual([]);
  });
});

describe("自己的保存不算外部修改", () => {
  it("[DESKTOP-EDITOR-36] 连续保存 5 次：没有提示，没有重读磁盘，内容不被换掉", async () => {
    const { session, disk } = await setup({ "src/App.tsx": "v0" });
    disk.reads.length = 0;
    for (let i = 1; i <= 5; i += 1) {
      session.edit("src/App.tsx", `v${i}`);
      await session.save("src/App.tsx");
      await ms(0);
      expect(tabOf(session)).toMatchObject({ conflict: false, text: `v${i}` });
    }
    expect(disk.reads).toEqual([]);
  });

  it("[DESKTOP-EDITOR-36] 保存的同时又输入：自己的那条变化事件不会把新输入当成冲突", async () => {
    const { session } = await setup({ "src/App.tsx": "v0" });
    session.edit("src/App.tsx", "v1");
    const saving = session.save("src/App.tsx");
    session.edit("src/App.tsx", "v1 more");
    await saving;
    await ms(0);
    expect(tabOf(session)).toMatchObject({ conflict: false, text: "v1 more" });
  });
});
