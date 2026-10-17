// 应用命令的登记表（规格 DESKTOP-EDITOR 的“命令面板”要求）：菜单、快捷键、命令面板共用这一份，
// 同一条命令只有一个标识符、一个分组、一个快捷键，不会在三处各写一遍而走样。
// 这里只有数据，没有给人看的文字：名称在 renderer/features/palette/command-titles.ts 里走文案包；
// 命令能不能用、点了做什么，由各个界面部件在显示期间登记（renderer/shared/command-host.tsx）。

export type CommandGroup = "app" | "project" | "editor";

export interface CommandSpec {
  group: CommandGroup;
  /**
   * 快捷键，写成 Electron 加速键的样子（CmdOrCtrl、Ctrl、Alt、Shift；两步的用空格隔开）。
   * 菜单项直接用它，命令面板右侧的快捷键由它生成；没有快捷键的命令不写。
   */
  accelerator?: string;
}

// 顺序就是命令面板里同组命令的顺序
export const commandRegistry = {
  // 应用
  "app.new": { group: "app", accelerator: "CmdOrCtrl+N" },
  "app.openLibrary": { group: "app" },
  "app.settings": { group: "app" },
  "app.quickOpen": { group: "app", accelerator: "CmdOrCtrl+P" },
  "app.showTerminal": { group: "app" },
  "app.showOutput": { group: "app" },
  "app.openRunning": { group: "app" },
  "app.stopAll": { group: "app" },
  "app.toggleSidebar": { group: "app", accelerator: "Ctrl+Cmd+S" },
  "app.toggleTree": { group: "app" },
  "app.themeLight": { group: "app" },
  "app.themeDark": { group: "app" },
  "app.themeSystem": { group: "app" },
  // 项目
  "project.run": { group: "project" },
  "project.stop": { group: "project" },
  "project.restart": { group: "project" },
  "project.reloadPreview": { group: "project" },
  "project.openInBrowser": { group: "project" },
  "project.openDevtools": { group: "project" },
  "project.rename": { group: "project" },
  "project.editNote": { group: "project" },
  "project.autoClean": { group: "project" },
  "project.saveAsTemplate": { group: "project" },
  "project.duplicate": { group: "project" },
  "project.openInEditor": { group: "project" },
  "project.reveal": { group: "project" },
  "project.openTerminal": { group: "project" },
  "project.copyPath": { group: "project" },
  "project.copyLink": { group: "project" },
  "project.trash": { group: "project" },
  // 编辑器
  "editor.save": { group: "editor", accelerator: "CmdOrCtrl+S" },
  "editor.closeTab": { group: "editor", accelerator: "CmdOrCtrl+W" },
  "editor.find": { group: "editor", accelerator: "CmdOrCtrl+F" },
  "editor.replace": { group: "editor", accelerator: "Alt+CmdOrCtrl+F" },
  "editor.goToLine": { group: "editor", accelerator: "Ctrl+G" },
  "editor.goToDefinition": { group: "editor", accelerator: "F12" },
  "editor.renameSymbol": { group: "editor", accelerator: "F2" },
  "editor.toggleComment": { group: "editor", accelerator: "CmdOrCtrl+/" },
  "editor.foldAll": { group: "editor", accelerator: "CmdOrCtrl+K CmdOrCtrl+0" },
  "editor.unfoldAll": { group: "editor", accelerator: "CmdOrCtrl+K CmdOrCtrl+J" },
  "editor.selectAllOccurrences": { group: "editor", accelerator: "CmdOrCtrl+Shift+L" },
} as const satisfies Record<string, CommandSpec>;

export type CommandId = keyof typeof commandRegistry;

export const commandIds = Object.keys(commandRegistry) as CommandId[];

/** 命令面板本身和快速打开的快捷键：不是面板里的命令，菜单和界面都要用 */
export const paletteAccelerators = {
  /** ⌘⇧P */
  palette: "CmdOrCtrl+Shift+P",
  /** F1：也打开命令面板，编辑器自带的那个不再出现 */
  paletteAlt: "F1",
  quickOpen: commandRegistry["app.quickOpen"].accelerator,
} as const;

const MAC_SYMBOLS: Record<string, string> = {
  CmdOrCtrl: "⌘",
  Cmd: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
};
// macOS 上修饰键的书写顺序：⌃ ⌥ ⇧ ⌘
const MAC_ORDER = ["Ctrl", "Alt", "Shift", "CmdOrCtrl", "Cmd"];

/** 把加速键写成界面上的样子：macOS 是 ⌃⌥⇧⌘ 加按键，其余是 Ctrl+Shift+P 这样 */
export function shortcutLabel(accelerator: string, modKey: "meta" | "ctrl"): string {
  return accelerator
    .split(" ")
    .map((step) => {
      const parts = step.split("+");
      const key = (parts.pop() ?? "").toUpperCase();
      const mods = parts.filter((part) => part in MAC_SYMBOLS);
      if (modKey === "meta") {
        mods.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
        return `${mods.map((mod) => MAC_SYMBOLS[mod]).join("")}${key}`;
      }
      const words = mods.map((mod) => (mod === "CmdOrCtrl" || mod === "Cmd" ? "Ctrl" : mod));
      return [...new Set(words), key].join("+");
    })
    .join(" ");
}
