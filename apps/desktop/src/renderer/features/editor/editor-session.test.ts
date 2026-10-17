import { describe, expect, it } from "vitest";
import { EditorSession } from "./editor-session.ts";
import type { AutosaveMode } from "./session-types.ts";
import { fakeDisk, fakeMemory, filesOn } from "./test-files.ts";

function setup(
  files: Parameters<typeof fakeDisk>[0],
  options: { autosave?: AutosaveMode; remembered?: Parameters<typeof fakeMemory>[0] } = {},
) {
  const disk = fakeDisk(files);
  const memory = fakeMemory(options.remembered ?? null);
  const mode = { current: options.autosave ?? "off" };
  const session = new EditorSession({
    files: filesOn(disk),
    memory,
    autosave: () => mode.current,
  });
  return { disk, memory, mode, session };
}

const paths = (session: EditorSession) => session.getState().tabs.map((tab) => tab.path);

describe("文件标签", () => {
  it("第一次打开项目就打开入口文件，并记住它", async () => {
    const { session, memory } = setup({ "src/App.tsx": "a" });
    await session.start("src/App.tsx");
    expect(paths(session)).toEqual(["src/App.tsx"]);
    expect(session.getState().active).toBe("src/App.tsx");
    expect(memory.saved).toEqual({ paths: ["src/App.tsx"], active: "src/App.tsx" });
  });

  it("[DESKTOP-EDITOR-15] 同一个文件只开一个标签，再次打开只是切过去", async () => {
    const { session } = setup({ "src/App.tsx": "a", "src/main.tsx": "b" });
    await session.start("src/App.tsx");
    await session.openFile("src/main.tsx");
    expect(session.getState().active).toBe("src/main.tsx");
    await session.openFile("src/App.tsx");
    expect(paths(session)).toEqual(["src/App.tsx", "src/main.tsx"]);
    expect(session.getState().active).toBe("src/App.tsx");
  });

  it("[DESKTOP-EDITOR-16] 输入后有未保存标记，保存后标记消失、磁盘是新内容", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" });
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "ab");
    const tab = () => session.getState().tabs[0];
    expect(tab()?.text).not.toBe(tab()?.savedText);
    expect(await session.save("src/App.tsx")).toBe(true);
    expect(tab()?.text).toBe(tab()?.savedText);
    expect(disk.writes).toEqual([{ path: "src/App.tsx", content: "ab", eol: undefined }]);
  });

  it("[DESKTOP-EDITOR-17] ⌘W 先关文件标签，没有文件标签了才轮到项目标签页", async () => {
    const { session } = setup({ "src/App.tsx": "a", "src/main.tsx": "b" });
    await session.start("src/App.tsx");
    await session.openFile("src/main.tsx");
    expect(session.closeCurrent()).toBe(true);
    await Promise.resolve();
    expect(paths(session)).toEqual(["src/App.tsx"]);
    expect(session.closeCurrent()).toBe(true);
    await Promise.resolve();
    expect(paths(session)).toEqual([]);
    // 第三次：没有文件标签可关，交给调用方关项目标签页
    expect(session.closeCurrent()).toBe(false);
  });

  it("[DESKTOP-EDITOR-18] 自动保存开着时关闭有修改的标签，先写入再关，不询问", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, { autosave: "delay" });
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "刚输入的");
    await session.requestClose("src/App.tsx");
    expect(session.getState().closePrompt).toBeNull();
    expect(paths(session)).toEqual([]);
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入的" });
  });

  it("[DESKTOP-EDITOR-18] 失去焦点档同样先写入再关", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, { autosave: "blur" });
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "b");
    await session.requestClose("src/App.tsx");
    expect(disk.writes).toHaveLength(1);
    expect(paths(session)).toEqual([]);
  });

  it("[DESKTOP-EDITOR-18] 先写入再关时写入失败，标签和修改都留着", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, { autosave: "delay" });
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "b");
    disk.failNextWrite = "read-only";
    await session.requestClose("src/App.tsx");
    expect(paths(session)).toEqual(["src/App.tsx"]);
    expect(session.getState().tabs[0]).toMatchObject({ text: "b", saveError: "read-only" });
  });

  describe("[DESKTOP-EDITOR-19] 自动保存关闭时询问", () => {
    async function dirty() {
      const ctx = setup({ "src/App.tsx": "a" }, { autosave: "off" });
      await ctx.session.start("src/App.tsx");
      ctx.session.edit("src/App.tsx", "b");
      await ctx.session.requestClose("src/App.tsx");
      return ctx;
    }

    it("先询问，选取消时标签和修改都在", async () => {
      const { session } = await dirty();
      expect(session.getState().closePrompt).toBe("src/App.tsx");
      await session.answerClose("cancel");
      expect(paths(session)).toEqual(["src/App.tsx"]);
      expect(session.getState().tabs[0]?.text).toBe("b");
      expect(session.getState().closePrompt).toBeNull();
    });

    it("选不保存：标签关闭，磁盘不变", async () => {
      const { session, disk } = await dirty();
      await session.answerClose("discard");
      expect(paths(session)).toEqual([]);
      expect(disk.writes).toEqual([]);
      expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "a" });
    });

    it("选保存：写入后关闭", async () => {
      const { session, disk } = await dirty();
      await session.answerClose("save");
      expect(paths(session)).toEqual([]);
      expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "b" });
    });

    it("没有未保存的修改时不询问，直接关", async () => {
      const { session } = setup({ "src/App.tsx": "a" });
      await session.start("src/App.tsx");
      await session.requestClose("src/App.tsx");
      expect(session.getState().closePrompt).toBeNull();
      expect(paths(session)).toEqual([]);
    });
  });

  it("[DESKTOP-EDITOR-20] 重新打开项目恢复上次的文件标签和选中的那个，已不存在的跳过", async () => {
    const { session } = setup(
      { "src/App.tsx": "a", "src/App.css": "b" },
      {
        remembered: {
          paths: ["src/App.tsx", "src/App.css", "src/main.tsx"],
          active: "src/App.css",
        },
      },
    );
    await session.start("src/App.tsx");
    expect(paths(session)).toEqual(["src/App.tsx", "src/App.css"]);
    expect(session.getState().active).toBe("src/App.css");
  });

  it("[DESKTOP-EDITOR-20] 上次选中的文件没了就选相邻的那个；记着的全没了退回入口文件", async () => {
    const first = setup(
      { "a.ts": "a", "b.ts": "b" },
      { remembered: { paths: ["a.ts", "b.ts", "gone.ts"], active: "gone.ts" } },
    );
    await first.session.start("a.ts");
    expect(first.session.getState().active).toBe("b.ts");
    const second = setup(
      { "entry.ts": "e" },
      { remembered: { paths: ["gone.ts"], active: "gone.ts" } },
    );
    await second.session.start("entry.ts");
    expect(paths(second.session)).toEqual(["entry.ts"]);
  });

  it("上次把标签都关了就保持空，不再自动打开入口文件", async () => {
    const { session } = setup({ "src/App.tsx": "a" }, { remembered: { paths: [], active: null } });
    await session.start("src/App.tsx");
    expect(paths(session)).toEqual([]);
  });

  it("[DESKTOP-EDITOR-21] 不是文本的文件不当文字显示，标签保留供说明和“在访达中显示”", async () => {
    const { session } = setup({ "public/logo.png": { kind: "binary", size: 2048 } });
    await session.start(null);
    await session.openFile("public/logo.png");
    expect(session.getState().tabs[0]).toMatchObject({ view: "binary", text: "", size: 2048 });
  });

  it("[DESKTOP-EDITOR-22] 6 MB 的文本能打开但没有高亮和智能提示；60 MB 的不打开", async () => {
    const six = 6 * 1024 * 1024;
    const { session } = setup({
      "data.json": { kind: "text", content: "{}", size: six },
      "dump.json": { kind: "too-large", size: 60 * 1024 * 1024 },
    });
    await session.start(null);
    await session.openFile("data.json");
    await session.openFile("dump.json");
    const [data, dump] = session.getState().tabs;
    expect(data).toMatchObject({ view: "text", mode: "plain-large" });
    expect(dump).toMatchObject({ view: "too-large", text: "" });
  });

  it("[DESKTOP-EDITOR-54] 1 MB 以内有高亮，1 到 5 MB 当纯文本", async () => {
    const { session } = setup({
      "small.json": { kind: "text", content: "{}", size: 800 * 1024 },
      "mid.json": { kind: "text", content: "{}", size: 3 * 1024 * 1024 },
      "edge.json": { kind: "text", content: "{}", size: 1024 * 1024 },
    });
    await session.start(null);
    await session.openFile("small.json");
    await session.openFile("mid.json");
    await session.openFile("edge.json");
    expect(session.getState().tabs.map((tab) => tab.mode)).toEqual(["full", "plain", "full"]);
  });
});

describe("保存的写法", () => {
  it("保留换行符：CRLF 的文件按 CRLF 写回，没有换行的不统一", async () => {
    const { session, disk } = setup({
      "legacy.js": "a\r\nb",
      "one.txt": "no newline",
    });
    await session.start("legacy.js");
    await session.openFile("one.txt");
    session.edit("legacy.js", "a\r\nB");
    session.edit("one.txt", "No newline");
    await session.save("legacy.js");
    await session.save("one.txt");
    expect(disk.writes).toEqual([
      { path: "legacy.js", content: "a\r\nB", eol: "crlf" },
      { path: "one.txt", content: "No newline", eol: undefined },
    ]);
  });

  it("混用换行符的文件按多数那种统一，数量相同按 LF；编辑器里看到的已是统一后的", async () => {
    const { session } = setup({
      "mixed.js": "a\nb\nc\r\nd",
      "tie.js": "a\nb\r\nc",
    });
    await session.start("mixed.js");
    await session.openFile("tie.js");
    const [mixed, tie] = session.getState().tabs;
    expect(mixed).toMatchObject({ eol: "lf", text: "a\nb\nc\nd", mixedEol: true });
    expect(tie).toMatchObject({ eol: "lf", mixedEol: true });
  });

  it("开头的 BOM 在编辑器里看不到，写回时补上", async () => {
    const { session, disk } = setup({ "bom.txt": "﻿hello" });
    await session.start("bom.txt");
    expect(session.getState().tabs[0]?.text).toBe("hello");
    session.edit("bom.txt", "hello!");
    await session.save("bom.txt");
    expect(disk.writes[0]?.content).toBe("﻿hello!");
  });

  it("保存失败时内容和未保存标记都在，原因记下，再保存一次成功", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" });
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "b");
    disk.failNextWrite = "permission";
    expect(await session.save("src/App.tsx")).toBe(false);
    expect(session.getState().tabs[0]).toMatchObject({
      text: "b",
      savedText: "a",
      saveError: "permission",
    });
    expect(await session.save("src/App.tsx")).toBe(true);
    expect(session.getState().tabs[0]).toMatchObject({ savedText: "b", saveError: null });
  });

  it("写入的过程中又输入了，只记下写进去的那一份，未保存标记留着", async () => {
    const disk = fakeDisk({ "src/App.tsx": "a" });
    const real = filesOn(disk);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = new EditorSession({
      files: {
        read: real.read,
        write: async (path, content, eol) => {
          await gate;
          return real.write(path, content, eol);
        },
      },
      memory: fakeMemory(),
      autosave: () => "off",
    });
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "b");
    const saving = session.save("src/App.tsx");
    await Promise.resolve();
    session.edit("src/App.tsx", "bc");
    release();
    await saving;
    expect(session.getState().tabs[0]).toMatchObject({ text: "bc", savedText: "b" });
    expect(disk.writes.map((write) => write.content)).toEqual(["b"]);
  });

  it("失去焦点档：切到别的文件标签时写入刚才的文件", async () => {
    const { session, disk } = setup({ "a.ts": "a", "b.ts": "b" }, { autosave: "blur" });
    await session.start("a.ts");
    await session.openFile("b.ts");
    session.select("a.ts");
    session.edit("a.ts", "a2");
    session.select("b.ts");
    await Promise.resolve();
    await Promise.resolve();
    expect(disk.writes).toEqual([{ path: "a.ts", content: "a2", eol: undefined }]);
  });
});

describe("文件树的改名和移到废纸篓落到文件标签上", () => {
  it("[DESKTOP-EDITOR-09] 改名：标签换成新路径，未保存的修改还在，保存写进新路径", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" });
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "b");
    session.renamePath("src/App.tsx", "src/Main.tsx");
    expect(session.getState().tabs[0]).toMatchObject({
      path: "src/Main.tsx",
      text: "b",
      savedText: "a",
    });
    expect(session.getState().active).toBe("src/Main.tsx");
    await session.save("src/Main.tsx");
    expect(disk.writes).toEqual([{ path: "src/Main.tsx", content: "b", eol: undefined }]);
  });

  it("[DESKTOP-EDITOR-10] 改名文件夹：它下面打开的标签都指向新路径，标签的身份不变，也记进恢复清单", async () => {
    const { session, memory } = setup({ "src/components/Button.tsx": "x", "src/other.ts": "y" });
    await session.start("src/components/Button.tsx");
    await session.openFile("src/other.ts");
    const idBefore = session.getState().tabs[0]?.id;
    session.renamePath("src/components", "src/ui");
    expect(paths(session)).toEqual(["src/ui/Button.tsx", "src/other.ts"]);
    expect(session.getState().tabs[0]?.id).toBe(idBefore);
    expect(memory.saved?.paths).toEqual(["src/ui/Button.tsx", "src/other.ts"]);
  });

  it("[DESKTOP-EDITOR-11] 移到废纸篓：文件标签直接关闭，不询问；文件夹下面的也一起关", async () => {
    const { session } = setup({ "src/old.ts": "o", "src/lib/a.ts": "a", "src/lib/b.ts": "b" });
    await session.start("src/old.ts");
    await session.openFile("src/lib/a.ts");
    await session.openFile("src/lib/b.ts");
    session.removePath("src/old.ts");
    expect(paths(session)).toEqual(["src/lib/a.ts", "src/lib/b.ts"]);
    session.removePath("src/lib");
    expect(paths(session)).toEqual([]);
    expect(session.getState().closePrompt).toBeNull();
  });

  it("[DESKTOP-EDITOR-12] 有未保存的修改才返回要先写进去的内容（带 BOM），干净的文件返回 undefined", async () => {
    const { session } = setup({ "a.txt": "\uFEFFone", "b.txt": "two" });
    await session.start("a.txt");
    await session.openFile("b.txt");
    expect(session.unsavedContent("a.txt")).toBeUndefined();
    session.edit("a.txt", "one!");
    expect(session.unsavedContent("a.txt")).toBe("\uFEFFone!");
    expect(session.unsavedContent("b.txt")).toBeUndefined();
    expect(session.unsavedContent("missing.txt")).toBeUndefined();
  });

  it("改名后又打开同名的旧路径，是另一个标签", async () => {
    const { session } = setup({ "a.ts": "a" });
    await session.start("a.ts");
    session.renamePath("a.ts", "b.ts");
    await session.openFile("a.ts");
    const ids = session.getState().tabs.map((tab) => tab.id);
    expect(new Set(ids).size).toBe(2);
  });
});
