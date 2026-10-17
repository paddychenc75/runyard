import type { AbsPath, Disposable, WatchEvent } from "@runyard/platform";
import { describe, expect, it } from "vitest";
import type { FileChange } from "../../shared/editor-files.ts";
import { ChangeFeed } from "./change-feed.ts";

// 变化整理的纯逻辑：假的监听（手动送事件）、内存里的“磁盘”、假时钟，不碰真实文件系统和系统事件

function setup() {
  const disk = new Map<string, string>();
  const out: FileChange[] = [];
  let clock = 1_000;
  let push: (events: WatchEvent[]) => void = () => {};
  let disposed = false;
  const feed = new ChangeFeed({
    folder: "/project" as AbsPath,
    now: () => clock,
    readBytes: async (file) => {
      const text = disk.get(file.slice("/project/".length));
      return text === undefined ? null : new TextEncoder().encode(text);
    },
    emit: (changes) => out.push(...changes),
  });
  const started = feed.start(async (_root, opts, cb): Promise<Disposable> => {
    push = cb;
    expect(opts.ignore).toEqual(expect.arrayContaining([".git", ".runyard", "node_modules"]));
    return {
      dispose: async () => {
        disposed = true;
      },
    };
  });
  return {
    disk,
    out,
    feed,
    started,
    advance: (ms: number) => {
      clock += ms;
    },
    isDisposed: () => disposed,
    // 不停止监听的送法：连续送多批
    pushBatch: async (...events: WatchEvent[]) => {
      push(events);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

const change = (path: string): WatchEvent => ({ kind: "change", path }) as WatchEvent;

describe("ChangeFeed", () => {
  it("[DESKTOP-EDITOR-36] 磁盘内容和刚保存的一致就标 self，外部改成别的内容不标", async () => {
    const t = setup();
    await t.started;
    t.feed.noteOwnWrite("App.tsx", "mine");
    t.disk.set("App.tsx", "mine");
    await t.pushBatch(change("App.tsx"));
    t.disk.set("App.tsx", "theirs");
    await t.pushBatch(change("App.tsx"));
    expect(t.out.map((c) => c.self)).toEqual([true, false]);
  });

  it("先后两次保存的事件交错到达：磁盘上已是第二次的内容时，第一次的事件也算自己的", async () => {
    const t = setup();
    await t.started;
    t.feed.noteOwnWrite("a.ts", "v1");
    t.feed.noteOwnWrite("a.ts", "v2");
    t.disk.set("a.ts", "v2");
    await t.pushBatch(change("a.ts"), change("a.ts"));
    expect(t.out.map((c) => c.self)).toEqual([true, true]);
  });

  it("保存失败后撤销登记：之后别人写出同样内容不被当成自己的", async () => {
    const t = setup();
    await t.started;
    t.feed.noteOwnWrite("a.ts", "never landed");
    t.feed.forgetOwnWrite("a.ts", "never landed");
    t.disk.set("a.ts", "never landed");
    await t.pushBatch(change("a.ts"));
    expect(t.out[0]?.self).toBe(false);
  });

  it("登记超过 5 秒就失效，删除事件从不算自己的", async () => {
    const t = setup();
    await t.started;
    t.feed.noteOwnWrite("a.ts", "x");
    t.disk.set("a.ts", "x");
    await t.pushBatch({ kind: "remove", path: "a.ts" } as WatchEvent);
    t.advance(5_001);
    await t.pushBatch(change("a.ts"));
    expect(t.out.map((c) => c.self)).toEqual([false, false]);
  });

  it("不报告隐藏的内部文件夹、任意深度的依赖目录和原子写入的临时文件", async () => {
    const t = setup();
    await t.started;
    await t.pushBatch(
      change(".git/HEAD"),
      change(".runyard/s.json"),
      change("node_modules/a/b.js"),
      change("pkg/node_modules/c.js"),
      change("src/.git/x"),
      { kind: "add", path: ".App.tsx.0123456789ab.tmp" } as WatchEvent,
      change("src/App.tsx"),
      change(".env"),
    );
    expect(t.out.map((c) => c.path)).toEqual(["src/App.tsx", ".env"]);
  });

  it("停止后不再推送，并释放底层监听", async () => {
    const t = setup();
    await t.started;
    await t.feed.stop();
    await t.pushBatch(change("a.ts"));
    expect(t.out).toEqual([]);
    expect(t.isDisposed()).toBe(true);
  });
});
