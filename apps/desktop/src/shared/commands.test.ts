import { describe, expect, it } from "vitest";
import { commandRegistry, shortcutLabel } from "./commands.ts";

describe("shortcutLabel", () => {
  it("[DESKTOP-EDITOR-57] macOS 上写成 ⌃⌥⇧⌘ 加按键，右侧显示的快捷键与菜单是同一个来源", () => {
    expect(shortcutLabel("CmdOrCtrl+Shift+P", "meta")).toBe("⇧⌘P");
    expect(shortcutLabel("Ctrl+Cmd+S", "meta")).toBe("⌃⌘S");
    expect(shortcutLabel("Alt+CmdOrCtrl+F", "meta")).toBe("⌥⌘F");
    expect(shortcutLabel("F12", "meta")).toBe("F12");
    expect(shortcutLabel("CmdOrCtrl+K CmdOrCtrl+0", "meta")).toBe("⌘K ⌘0");
    expect(commandRegistry["editor.save"].accelerator).toBe("CmdOrCtrl+S");
  });

  it("其他系统写成 Ctrl+Shift+P 这样", () => {
    expect(shortcutLabel("CmdOrCtrl+Shift+P", "ctrl")).toBe("Ctrl+Shift+P");
    expect(shortcutLabel("Ctrl+Cmd+S", "ctrl")).toBe("Ctrl+S");
  });
});
