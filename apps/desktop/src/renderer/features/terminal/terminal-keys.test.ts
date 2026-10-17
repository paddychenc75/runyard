import { describe, expect, it } from "vitest";
import { type KeyLike, routeKey } from "./terminal-keys.ts";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("终端里的按键归谁管", () => {
  it("[DESKTOP-TERMINAL-15] ⌘C 是终端的复制；⌃C 原样交给 shell（中断）", () => {
    expect(routeKey(key("c", { metaKey: true }), "meta")).toEqual({
      route: "terminal",
      command: "copy",
    });
    expect(routeKey(key("c", { ctrlKey: true }), "meta")).toEqual({ route: "shell" });
    expect(routeKey(key("d", { ctrlKey: true }), "meta")).toEqual({ route: "shell" });
  });

  it("[DESKTOP-TERMINAL-16] ⌘V 粘贴、⌘A 全选、⌘K 清屏都是终端自己的", () => {
    expect(routeKey(key("v", { metaKey: true }), "meta")).toEqual({
      route: "terminal",
      command: "paste",
    });
    expect(routeKey(key("a", { metaKey: true }), "meta")).toEqual({
      route: "terminal",
      command: "selectAll",
    });
    expect(routeKey(key("k", { metaKey: true }), "meta")).toEqual({
      route: "terminal",
      command: "clear",
    });
  });

  it("[DESKTOP-TERMINAL-23] ⌘F 查找，⌘G 下一个，⇧⌘G 上一个", () => {
    expect(routeKey(key("f", { metaKey: true }), "meta")).toEqual({
      route: "terminal",
      command: "find",
    });
    expect(routeKey(key("g", { metaKey: true }), "meta")).toEqual({
      route: "terminal",
      command: "findNext",
    });
    expect(routeKey(key("G", { metaKey: true, shiftKey: true }), "meta")).toEqual({
      route: "terminal",
      command: "findPrevious",
    });
  });

  it("[DESKTOP-TERMINAL-20] 应用级快捷键（⌘P、⇧⌘P、⌘W、⌘S、⌘N、⌘Q）和 ⌃` 终端不吞", () => {
    for (const k of ["p", "w", "s", "n", "q", ","]) {
      expect(routeKey(key(k, { metaKey: true }), "meta")).toEqual({ route: "app" });
    }
    expect(routeKey(key("P", { metaKey: true, shiftKey: true }), "meta")).toEqual({
      route: "app",
    });
    expect(routeKey(key("`", { ctrlKey: true }), "meta")).toEqual({ route: "app" });
  });

  it("普通按键和 Esc 交给 shell；不是 macOS 的修饰键时一律交给 shell", () => {
    expect(routeKey(key("a"), "meta")).toEqual({ route: "shell" });
    expect(routeKey(key("Escape"), "meta")).toEqual({ route: "shell" });
    expect(routeKey(key("c", { ctrlKey: true }), "ctrl")).toEqual({ route: "shell" });
  });
});
