import { createTranslator, desktopCatalogs, type Locale } from "@runyard/i18n";
import type { MenuItemConstructorOptions } from "electron";
import { type CommandId, commandRegistry, paletteAccelerators } from "../../shared/commands.ts";

// 应用菜单（规格 DESKTOP-CREATE-FLOW-03、DESKTOP-LIBRARY-VIEW-61，#432）：照 macOS 的标准结构——应用菜单、
// 文件、编辑、显示、项目、窗口、帮助。
// - 每一项的 label 都显式按应用语言取文案，role 只管行为；否则系统角色的名字跟系统语言走，应用语言和系统语言
//   不一致时菜单一半中文一半英文。
// - 触发应用命令的项只带命令标识符，快捷键从 shared/commands.ts 的登记表取，点了交给 runCommand：
//   焦点在预览视图里（那是另一个网页，按键到不了界面）也有效。设置与其它应用页面一样经
//   “app.settings”导航，菜单和 ⌘, 共用入口。
// - 重新载入、强制重新载入、开发者工具只在开发构建里有：⌘R 在正式包里是“运行”，不能重载整页。
// 平台作为参数传进来：只有 macOS 有以应用名为标题的第一项，其余平台把设置、检查更新、退出放进文件菜单。

export interface AppMenuOptions {
  locale: Locale;
  platform: "darwin" | "win32" | "linux";
  /** 开发构建（从源码运行）：多出重新载入和开发者工具 */
  development: boolean;
  /** 执行一条应用命令；命令此刻不能用（界面没登记）就什么都不发生 */
  runCommand: (id: CommandId) => void;
  /** 命令面板（⌘⇧P、F1）：资源库页和项目标签页上都可用（规格 DESKTOP-EDITOR-64、65） */
  onCommandPalette: () => void;
  /** 快速打开（⌘P） */
  onQuickOpen: () => void;
  /** 检查更新… */
  onCheckUpdates: () => void;
  /** Runyard 帮助 */
  onOpenHelp: () => void;
  /** 报告问题… */
  onReportIssue: () => void;
  /** 当前是项目标签页：资源库页上“快速打开文件”和整个“项目”菜单的操作灰掉（规格 DESKTOP-EDITOR-73） */
  projectTabActive: boolean;
  settingsPageActive?: boolean;
}

const APP_NAME = "Runyard";

export function buildAppMenu(options: AppMenuOptions): MenuItemConstructorOptions[] {
  const mac = options.platform === "darwin";
  const { t } = createTranslator({
    locale: options.locale,
    platform: mac ? "darwin" : "linux",
    catalogs: desktopCatalogs,
  });
  const separator: MenuItemConstructorOptions = { type: "separator" };
  const command = (
    id: CommandId,
    label: string,
    extra: MenuItemConstructorOptions = {},
  ): MenuItemConstructorOptions => {
    const accelerator = (commandRegistry[id] as { accelerator?: string }).accelerator;
    return {
      label,
      ...(accelerator === undefined ? {} : { accelerator }),
      click: () => options.runCommand(id),
      ...extra,
    };
  };
  const settings = command("app.settings", t("desktop.menu.settings.label"));
  const checkUpdates: MenuItemConstructorOptions = {
    label: t("desktop.menu.checkUpdates.label"),
    click: options.onCheckUpdates,
  };
  const onProject = options.projectTabActive;

  const appMenu: MenuItemConstructorOptions = {
    label: APP_NAME,
    submenu: [
      { role: "about", label: t("desktop.menu.about.label") },
      checkUpdates,
      separator,
      settings,
      separator,
      { role: "services", label: t("desktop.menu.services.label") },
      separator,
      { role: "hide", label: t("desktop.menu.hide.label") },
      { role: "hideOthers", label: t("desktop.menu.hideOthers.label") },
      { role: "unhide", label: t("desktop.menu.showAll.label") },
      separator,
      { role: "quit", label: t("desktop.menu.quit.label") },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: t("desktop.menu.file.title"),
    submenu: [
      command("app.new", t("desktop.menu.new.label")),
      {
        label: t("desktop.menu.quickOpen.label"),
        accelerator: paletteAccelerators.quickOpen,
        enabled: options.projectTabActive,
        click: options.onQuickOpen,
      },
      separator,
      // ⌘W 关当前标签页（先关文件标签，没有再关项目标签页）；关整个窗口是 ⇧⌘W
      command("app.closeTab", t("desktop.menu.closeTab.label"), {
        enabled: onProject || options.settingsPageActive === true,
      }),
      {
        role: "close" as const,
        label: t("desktop.menu.closeWindow.label"),
        accelerator: "CmdOrCtrl+Shift+W",
      },
      ...(mac
        ? []
        : [
            separator,
            settings,
            checkUpdates,
            separator,
            { role: "quit", label: t("desktop.menu.quit.label") } as const,
          ]),
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: t("desktop.menu.edit.title"),
    submenu: [
      { role: "undo", label: t("desktop.menu.undo.label") },
      { role: "redo", label: t("desktop.menu.redo.label") },
      separator,
      { role: "cut", label: t("desktop.menu.cut.label") },
      { role: "copy", label: t("desktop.menu.copy.label") },
      { role: "paste", label: t("desktop.menu.paste.label") },
      { role: "pasteAndMatchStyle", label: t("desktop.menu.pasteMatch.label") },
      { role: "delete", label: t("desktop.menu.delete.label") },
      { role: "selectAll", label: t("desktop.menu.selectAll.label") },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: t("desktop.menu.view.title"),
    submenu: [
      {
        label: t("desktop.menu.palette.label"),
        accelerator: paletteAccelerators.palette,
        click: options.onCommandPalette,
      },
      // F1 是同一个命令的第二个快捷键：Electron 一个菜单项只有一个加速键，所以多放一个看不见的项
      {
        label: t("desktop.menu.palette.label"),
        accelerator: paletteAccelerators.paletteAlt,
        visible: false,
        click: options.onCommandPalette,
      },
      separator,
      command("app.toggleSidebar", t("desktop.menu.sidebar.label"), {
        // 非 macOS 上 Ctrl+Cmd 不存在，换成 Ctrl+Alt+S
        ...(mac ? {} : { accelerator: "Ctrl+Alt+S" }),
      }),
      command("app.toggleTree", t("desktop.menu.tree.label"), { enabled: onProject }),
      command("app.showOutput", t("desktop.command.showOutput.label"), { enabled: onProject }),
      command("app.showTerminal", t("desktop.command.showTerminal.label"), { enabled: onProject }),
      separator,
      { role: "resetZoom", label: t("desktop.menu.actualSize.label") },
      { role: "zoomIn", label: t("desktop.menu.zoomIn.label") },
      { role: "zoomOut", label: t("desktop.menu.zoomOut.label") },
      ...(options.development
        ? [
            separator,
            // 开发构建里 ⌘R 也是“运行”，所以重新载入换一个快捷键
            {
              role: "reload",
              label: t("desktop.menu.reload.label"),
              accelerator: "CmdOrCtrl+Alt+R",
            } as const,
            {
              role: "forceReload",
              label: t("desktop.menu.forceReload.label"),
              accelerator: "CmdOrCtrl+Alt+Shift+R",
            } as const,
            { role: "toggleDevTools", label: t("desktop.menu.devtools.label") } as const,
          ]
        : []),
      separator,
      { role: "togglefullscreen", label: t("desktop.menu.fullscreen.label") },
    ],
  };

  const projectMenu: MenuItemConstructorOptions = {
    label: t("desktop.menu.project.title"),
    submenu: [
      command("project.run", t("desktop.command.run.label"), { enabled: onProject }),
      command("project.stop", t("desktop.command.stop.label"), { enabled: onProject }),
      command("project.restart", t("desktop.command.restart.label"), { enabled: onProject }),
      separator,
      command("project.reveal", t("desktop.command.reveal.label"), { enabled: onProject }),
      command("project.openTerminal", t("desktop.command.openTerminal.label"), {
        enabled: onProject,
      }),
      command("project.copyLink", t("desktop.command.copyLink.label"), { enabled: onProject }),
      separator,
      command("project.trash", t("desktop.menu.trash.label"), { enabled: onProject }),
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: t("desktop.menu.window.title"),
    role: "window",
    submenu: [
      { role: "minimize", label: t("desktop.menu.minimize.label") },
      { role: "zoom", label: t("desktop.menu.windowZoom.label") },
      separator,
      { role: "front", label: t("desktop.menu.windowFront.label") },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: t("desktop.menu.help.title"),
    role: "help",
    submenu: [
      { label: t("desktop.menu.helpPage.label"), click: options.onOpenHelp },
      { label: t("desktop.menu.reportIssue.label"), click: options.onReportIssue },
    ],
  };

  return [
    ...(mac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    projectMenu,
    windowMenu,
    helpMenu,
  ];
}
