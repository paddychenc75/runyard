import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorSession } from "./editor-session.ts";
import type { AutosaveMode } from "./session-types.ts";
import { fakeDisk, fakeMemory, filesOn } from "./test-files.ts";

// 自动保存三档、⌘S、关闭前先写入、写入的写法（规格 desktop/editor「自动保存三档」）。计时用假时钟。

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(files: Parameters<typeof fakeDisk>[0], autosave: AutosaveMode) {
  const disk = fakeDisk(files);
  const mode = { current: autosave };
  const session = new EditorSession({
    files: filesOn(disk),
    memory: fakeMemory(),
    autosave: () => mode.current,
  });
  return { disk, mode, session };
}

const ms = (n: number) => vi.advanceTimersByTimeAsync(n);

describe("自动保存三档", () => {
  it("[DESKTOP-EDITOR-23] 默认档：每 0.5 秒输入一个字符连续 3 秒，期间磁盘不变；停下满 1 秒后写入", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, "delay");
    await session.start("src/App.tsx");
    let text = "a";
    for (let i = 0; i < 6; i += 1) {
      text += String(i);
      session.edit("src/App.tsx", text);
      await ms(500);
      expect(disk.writes).toEqual([]);
    }
    await ms(499);
    expect(disk.writes).toEqual([]);
    await ms(1);
    expect(disk.writes).toEqual([{ path: "src/App.tsx", content: text, eol: undefined }]);
    const tab = session.getState().tabs[0];
    expect(tab?.text).toBe(tab?.savedText);
  });

  it("[DESKTOP-EDITOR-23] 每个文件各自计时，互不重置", async () => {
    const { session, disk } = setup({ "a.ts": "a", "b.ts": "b" }, "delay");
    await session.start("a.ts");
    await session.openFile("b.ts");
    session.edit("a.ts", "a1");
    await ms(600);
    session.edit("b.ts", "b1");
    await ms(400);
    expect(disk.writes.map((w) => w.path)).toEqual(["a.ts"]);
    await ms(600);
    expect(disk.writes.map((w) => w.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("[DESKTOP-EDITOR-24] 失去焦点档：输入后等 3 秒磁盘不变，切到别的文件标签后写入", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a", "src/main.tsx": "m" }, "blur");
    await session.start("src/App.tsx");
    await session.openFile("src/main.tsx");
    session.select("src/App.tsx");
    session.edit("src/App.tsx", "刚输入");
    await ms(3000);
    expect(disk.writes).toEqual([]);
    session.select("src/main.tsx");
    await ms(0);
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
  });

  it("[DESKTOP-EDITOR-24] 失去焦点档：窗口或编辑区失去焦点（blur）时把所有有修改的文件都写入", async () => {
    const { session, disk } = setup({ "a.ts": "a", "b.ts": "b" }, "blur");
    await session.start("a.ts");
    await session.openFile("b.ts");
    session.edit("a.ts", "a1");
    session.edit("b.ts", "b1");
    session.blur();
    await ms(0);
    expect(disk.writes.map((w) => w.path).sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("[DESKTOP-EDITOR-24] 另外两档不因 blur 写入", async () => {
    for (const mode of ["delay", "off"] as const) {
      const { session, disk } = setup({ "a.ts": "a" }, mode);
      await session.start("a.ts");
      session.edit("a.ts", "a1");
      session.blur();
      // delay 档要等满 1 秒才写，blur 本身不触发
      await ms(900);
      expect(disk.writes).toEqual([]);
    }
  });

  it("[DESKTOP-EDITOR-25] 关闭档：输入、等 3 秒、切走再切回，磁盘一直不变；按 ⌘S 才写入", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a", "src/main.tsx": "m" }, "off");
    await session.start("src/App.tsx");
    await session.openFile("src/main.tsx");
    session.select("src/App.tsx");
    session.edit("src/App.tsx", "刚输入");
    await ms(3000);
    session.select("src/main.tsx");
    session.select("src/App.tsx");
    await ms(3000);
    expect(disk.writes).toEqual([]);
    await session.save("src/App.tsx");
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
  });

  it("[DESKTOP-EDITOR-26] 延迟档输入一个字符后马上按 ⌘S：不等 1 秒就写入，之后计时器不会再写第二遍", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, "delay");
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "ab");
    await session.save("src/App.tsx");
    expect(disk.writes).toHaveLength(1);
    await ms(2000);
    expect(disk.writes).toHaveLength(1);
  });

  it("切换档位立即生效：从延迟档改成关闭档后，新的输入不再自动写入", async () => {
    const { session, disk, mode } = setup({ "a.ts": "a" }, "delay");
    await session.start("a.ts");
    mode.current = "off";
    session.edit("a.ts", "a1");
    await ms(3000);
    expect(disk.writes).toEqual([]);
  });

  it("项目标签页关掉后丢弃会话：待写的计时作废，不会在关掉之后再写", async () => {
    const { session, disk } = setup({ "a.ts": "a" }, "delay");
    await session.start("a.ts");
    session.edit("a.ts", "a1");
    session.dispose();
    await ms(3000);
    expect(disk.writes).toEqual([]);
  });
});

describe("关闭项目标签页和退出前", () => {
  it("[DESKTOP-EDITOR-27] 延迟档刚输入、还没到 1 秒就关闭：磁盘上先有了刚输入的内容，才继续关闭", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, "delay");
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "刚输入");
    await ms(300);
    expect(disk.writes).toEqual([]);
    expect(await session.flushForClose()).toBe(true);
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "刚输入" });
    // 计时器已作废：不会再写一遍
    await ms(2000);
    expect(disk.writes).toHaveLength(1);
  });

  it("[DESKTOP-EDITOR-27] 失去焦点档同样先写入", async () => {
    const { session, disk } = setup({ "a.ts": "a", "b.ts": "b" }, "blur");
    await session.start("a.ts");
    await session.openFile("b.ts");
    session.edit("a.ts", "a1");
    session.edit("b.ts", "b1");
    expect(await session.flushForClose()).toBe(true);
    expect(disk.writes.map((w) => w.path).sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("[DESKTOP-EDITOR-27] 先写入时写入失败：中止关闭，回到那个文件，修改还在", async () => {
    const { session, disk } = setup({ "a.ts": "a", "b.ts": "b" }, "delay");
    await session.start("a.ts");
    await session.openFile("b.ts");
    session.edit("a.ts", "a1");
    disk.failNextWrite = "read-only";
    expect(await session.flushForClose()).toBe(false);
    expect(session.getState().active).toBe("a.ts");
    expect(session.getState().tabs[0]).toMatchObject({ text: "a1", saveError: "read-only" });
  });

  it("[DESKTOP-EDITOR-28] 关闭档有未保存的修改：先询问；选“取消”中止，修改和未保存标记都还在，磁盘没动", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, "off");
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "b");
    const outcome = session.flushForClose();
    await ms(0);
    expect(session.getState().closePrompt).toBe("src/App.tsx");
    await session.answerClose("cancel");
    expect(await outcome).toBe(false);
    expect(session.getState().tabs[0]).toMatchObject({ text: "b", savedText: "a" });
    expect(session.getState().closePrompt).toBeNull();
    expect(disk.writes).toEqual([]);
  });

  it("[DESKTOP-EDITOR-28] 关闭档选“保存”写入后继续，选“不保存”不写入也继续；文件标签都留着", async () => {
    const saved = setup({ "a.ts": "a" }, "off");
    await saved.session.start("a.ts");
    saved.session.edit("a.ts", "a1");
    const first = saved.session.flushForClose();
    await ms(0);
    await saved.session.answerClose("save");
    expect(await first).toBe(true);
    expect(saved.disk.files.get("a.ts")).toMatchObject({ content: "a1" });
    expect(saved.session.getState().tabs).toHaveLength(1);

    const dropped = setup({ "a.ts": "a" }, "off");
    await dropped.session.start("a.ts");
    dropped.session.edit("a.ts", "a1");
    const second = dropped.session.flushForClose();
    await ms(0);
    await dropped.session.answerClose("discard");
    expect(await second).toBe(true);
    expect(dropped.disk.writes).toEqual([]);
  });

  it("没有未保存的修改时直接放行，不询问", async () => {
    const { session } = setup({ "a.ts": "a" }, "off");
    await session.start("a.ts");
    expect(await session.flushForClose()).toBe(true);
    expect(session.getState().closePrompt).toBeNull();
  });
});

describe("保存的写法与失败", () => {
  it("[DESKTOP-EDITOR-29] 延迟档自动保存失败：内容和未保存标记都在、原因写明；下一次修改时自动再试，成功后清掉", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, "delay");
    await session.start("src/App.tsx");
    disk.failNextWrite = "read-only";
    session.edit("src/App.tsx", "b");
    await ms(1000);
    expect(session.getState().tabs[0]).toMatchObject({
      text: "b",
      savedText: "a",
      saveError: "read-only",
    });
    expect(disk.writes).toEqual([]);
    session.edit("src/App.tsx", "bc");
    await ms(1000);
    expect(session.getState().tabs[0]).toMatchObject({ savedText: "bc", saveError: null });
    expect(disk.files.get("src/App.tsx")).toMatchObject({ content: "bc" });
  });

  it("[DESKTOP-EDITOR-29] ⌘S 失败后，改回可写再按 ⌘S 写入成功", async () => {
    const { session, disk } = setup({ "src/App.tsx": "a" }, "off");
    await session.start("src/App.tsx");
    session.edit("src/App.tsx", "b");
    disk.failNextWrite = "permission";
    expect(await session.save("src/App.tsx")).toBe(false);
    expect(session.getState().tabs[0]).toMatchObject({ text: "b", saveError: "permission" });
    expect(await session.save("src/App.tsx")).toBe(true);
    expect(session.getState().tabs[0]).toMatchObject({ savedText: "b", saveError: null });
  });

  it("[DESKTOP-EDITOR-30] 原样保留换行符：CRLF 全部用 CRLF 写回、没有换行的不统一、全 LF 的原样往返", async () => {
    const { session, disk } = setup({ "legacy.js": "a\r\nb\r\nc", "lf.js": "a\nb\n" }, "off");
    await session.start("legacy.js");
    await session.openFile("lf.js");
    session.edit("legacy.js", "a\r\nB\r\nc");
    session.edit("lf.js", "a\nB\n");
    await session.save("legacy.js");
    await session.save("lf.js");
    expect(disk.writes).toEqual([
      { path: "legacy.js", content: "a\r\nB\r\nc", eol: "crlf" },
      { path: "lf.js", content: "a\nB\n", eol: "lf" },
    ]);
  });

  it("[DESKTOP-EDITOR-55] 换行符不统一：打开时标记一次提示（多数那种），保存时统一写回，提示随之消失不再重复", async () => {
    const lines = [...Array(8).fill("l\n"), ...Array(2).fill("c\r\n")].join("");
    const { session, disk } = setup({ "mixed.js": lines }, "off");
    await session.start("mixed.js");
    const opened = session.getState().tabs[0];
    expect(opened).toMatchObject({ eol: "lf", mixedEol: true });
    expect(opened?.text).not.toContain("\r");
    session.edit("mixed.js", `${opened?.text}x`);
    await session.save("mixed.js");
    expect(disk.writes[0]).toMatchObject({ eol: "lf" });
    expect(disk.writes[0]?.content).not.toContain("\r");
    expect(session.getState().tabs[0]?.mixedEol).toBe(false);
    session.edit("mixed.js", `${opened?.text}xy`);
    await session.save("mixed.js");
    expect(session.getState().tabs[0]?.mixedEol).toBe(false);
  });

  it("[DESKTOP-EDITOR-55] 数量相同统一成 LF；CRLF 占多数就统一成 CRLF", async () => {
    const { session } = setup({ "tie.js": "a\nb\r\nc", "most.js": "a\r\nb\r\nc\n" }, "off");
    await session.start("tie.js");
    await session.openFile("most.js");
    const [tie, most] = session.getState().tabs;
    expect(tie).toMatchObject({ eol: "lf", mixedEol: true });
    expect(most).toMatchObject({ eol: "crlf", mixedEol: true });
  });

  it("[DESKTOP-EDITOR-56] 保留 BOM：编辑器里看不到，写回时补上，其余字节不变", async () => {
    const { session, disk } = setup({ "bom.txt": "﻿line1\nline2" }, "off");
    await session.start("bom.txt");
    expect(session.getState().tabs[0]?.text).toBe("line1\nline2");
    session.edit("bom.txt", "line1\nLINE2");
    await session.save("bom.txt");
    expect(disk.writes[0]?.content).toBe("﻿line1\nLINE2");
  });
});
