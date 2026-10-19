import type { CommandId } from "../shared/commands.ts";
import {
  type BootstrapInfo,
  type CreateRequest,
  type CreateResult,
  type DesktopMethod,
  desktopChannels,
  desktopMethodNames,
  type EditRequest,
  type EditResult,
} from "../shared/desktop-bridge.ts";
import type { AgentSkillStatus, CliCommandStatus } from "../shared/settings-bridge.ts";
import { isAppUrl } from "./app-protocol.ts";
import { editorFileMethods, type FileOpeners } from "./editor-files/editor-ipc.ts";
import type { EditorFileService } from "./editor-files/file-service.ts";
import type { FlushGates } from "./flush-gates.ts";
import { parseBounds, parseQuitReply } from "./ipc-parsers.ts";
import type { LibraryController } from "./library-controller.ts";
import type { LinkHandler } from "./links/link-handler.ts";
import { requestMethods } from "./request-ipc.ts";
import type { SettingsController } from "./settings-controller.ts";
import { templateMethods } from "./template-ipc.ts";
import type { TemplatesView } from "./templates-view.ts";
import { terminalMethods } from "./terminal/terminal-ipc.ts";
import type { TerminalService } from "./terminal/terminal-service.ts";
import type { UpdateChecker } from "./updates/update-checker.ts";

// 把界面发来的消息接到控制器上。Electron 的 ipcMain 通过 IpcHost 这个接口传进来，测试里换成假的。

export interface IpcSender {
  /** 发消息的页面地址 */
  url: string;
}

export interface IpcHost {
  /** 异步调用（ipcRenderer.invoke） */
  handle(channel: string, handler: (sender: IpcSender, ...args: unknown[]) => unknown): void;
  /** 同步调用（ipcRenderer.sendSync），只给启动信息用 */
  handleSync(channel: string, handler: (sender: IpcSender) => unknown): void;
  send(channel: string, event: string, payload: unknown): void;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** 项目 id 的列表：不是字符串数组就当空（页面发来的数据不可信） */
function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => text(id) !== null) : [];
}

/** 界面发来的新建内容：形状不对一律不要（页面发来的数据不可信）；名称是否合法由管理进程判 */
function parseCreateRequest(value: unknown): CreateRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { template, name, note, autoClean } = value as Record<string, unknown>;
  if (text(template) === null || text(name) === null || typeof note !== "string") return null;
  const days =
    autoClean === null
      ? null
      : Number.isInteger(autoClean) && (autoClean as number) > 0
        ? autoClean
        : undefined;
  if (days === undefined) return null;
  return {
    template: template as string,
    name: name as string,
    note,
    autoClean: days as number | null,
  };
}

/** 重命名和备注：形状不对一律不要；名称是否合法由管理进程判 */
function parseEditRequest(value: unknown): EditRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, name, note } = value as Record<string, unknown>;
  if (text(id) === null || text(name) === null || typeof note !== "string") return null;
  return { id: id as string, name: name as string, note };
}

const unavailableCli: CliCommandStatus = {
  state: "unavailable",
  version: "",
  onPath: false,
  pathCommand: "",
};
const noSkills: AgentSkillStatus = { claude: false, agents: false };
const rejectedEdit: EditResult = { ok: false, error: { code: "INTERNAL", params: {} } };
const rejectedCreate: CreateResult = { ok: false, error: { code: "INTERNAL", params: {} } };

/** 占位区的矩形：四个有限的数，宽高不为负；其他形状一律不要（页面发来的数据不可信） */
/** 链接和更新检查（它们的状态经控制器的 chrome 推给界面，界面只发这几个操作） */
export interface AppLinks {
  links: Pick<LinkHandler, "confirm" | "cancel">;
  updates: Pick<UpdateChecker, "download" | "later">;
}

/** 注册全部通道，并把状态变化推给界面；返回停止推送的函数 */
export function registerBridgeHandlers(
  host: IpcHost,
  controller: LibraryController,
  bootstrap: BootstrapInfo | (() => BootstrapInfo),
  files?: EditorFileService,
  openers?: FileOpeners,
  gates?: FlushGates,
  settings?: SettingsController,
  terminals?: TerminalService,
  templates?: TemplatesView,
  appLinks?: AppLinks,
  openSettings?: () => void,
): () => void {
  // 方法名到控制器的映射；参数不是预期类型时不调用控制器
  const methods: Record<DesktopMethod, (param: unknown) => unknown> = {
    "library.get": () => controller.getState(),
    "run.start": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.startRun(playground);
    },
    "run.stop": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.stopRun(playground);
    },
    "run.stopAll": async () => {
      await controller.stopAll();
    },
    "run.adopt": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.adoptRun(playground);
    },
    "run.restart": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.runBar.restart(playground);
    },
    "run.stdin": async (value) => {
      if (typeof value !== "object" || value === null) return;
      const { id, line } = value as Record<string, unknown>;
      const playground = text(id);
      if (playground !== null && typeof line === "string") {
        await controller.runBar.sendInput(playground, line);
      }
    },
    "playground.scriptAutoRun": async (value) => {
      if (typeof value !== "object" || value === null) return;
      const { id, enabled } = value as Record<string, unknown>;
      const playground = text(id);
      if (playground !== null && typeof enabled === "boolean") {
        await controller.runBar.setScriptAutoRun(playground, enabled);
      }
    },
    "console.clear": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.runBar.clearConsole(playground);
    },
    "preview.reload": (id) => {
      const playground = text(id);
      if (playground !== null) controller.runBar.reloadPreview(playground);
    },
    "preview.openExternal": (id) => {
      const playground = text(id);
      if (playground !== null) controller.runBar.openPreviewInBrowser(playground);
    },
    "preview.devtools": (id) => {
      const playground = text(id);
      if (playground !== null) controller.runBar.openPreviewDevTools(playground);
    },
    "tab.open": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.openProject(playground);
    },
    "tab.openWithoutRun": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.openProjectWithoutRun(playground);
    },
    "tab.select": async (id) => {
      const tab = text(id);
      if (tab !== null) controller.selectTab(tab);
    },
    "tab.close": async (id) => {
      const tab = text(id);
      if (tab !== null) await controller.requestCloseTab(tab);
    },
    "tab.closeConfirm": async (value) => {
      if (typeof value !== "object" || value === null) return;
      const { id, dontAskAgain } = value as Record<string, unknown>;
      const tab = text(id);
      if (tab !== null && typeof dontAskAgain === "boolean") {
        await controller.confirmClose(tab, dontAskAgain);
      }
    },
    "tab.closeCancel": () => controller.cancelClose(),
    "app.quitReply": (value) => {
      const reply = parseQuitReply(value);
      if (reply !== null) gates?.quit.reply(reply);
    },
    "project.flushReply": (value) => {
      const reply = parseQuitReply(value);
      if (reply !== null) gates?.project.reply(reply);
    },
    "preview.bounds": (value) => {
      if (value === null) controller.setPreviewBounds(null);
      else {
        const bounds = parseBounds(value);
        if (bounds !== null) controller.setPreviewBounds(bounds);
      }
    },
    "preview.capture": () => controller.capturePreview(),
    "preview.visible": (visible) => {
      if (typeof visible === "boolean") controller.setPreviewVisible(visible);
    },
    "console.get": (id) => {
      const playground = text(id);
      return playground === null ? [] : controller.consoleLines(playground);
    },
    "playground.reveal": (id) => {
      const playground = text(id);
      if (playground !== null) controller.system.reveal(playground);
    },
    "playground.copyPath": (id) => {
      const playground = text(id);
      if (playground !== null) controller.system.copyPath(playground);
    },
    "clipboard.copy": (value) => {
      if (typeof value === "string") controller.system.copyText(value);
    },
    "clipboard.read": () => controller.system.readText(),
    "link.openWeb": (value) => {
      if (typeof value === "string") controller.system.openWebLink(value);
    },
    "link.open": (value) => {
      if (typeof value === "string") controller.system.openLink(value);
    },
    "playground.create": async (value) => {
      const request = parseCreateRequest(value);
      return request === null ? rejectedCreate : await controller.create(request);
    },
    // 设置页（#188）；没接线时设置读不到，界面显示默认值
    "settings.open": () => openSettings?.(),
    "settings.get": () => settings?.get(),
    "settings.set": (patch) => settings?.set(patch),
    "settings.editors": async () => (await settings?.editors()) ?? [],
    "settings.pickLibraryRoot": async () => (await settings?.pickLibraryRoot()) ?? null,
    "settings.revealLibraryRoot": async () => {
      await settings?.revealLibraryRoot();
    },
    "playground.openInEditor": async (id) => {
      const playground = text(id);
      if (playground !== null) await settings?.openInEditor(playground);
    },
    // 依赖与网络、运行环境、命令行与智能体（#189、#195）；没接线时这些项读到空
    "settings.localNetwork": async () => (await settings?.toolchain?.localNetwork()) ?? {},
    "toolchain.check": async (value) => {
      const cachedOnly =
        typeof value === "object" &&
        value !== null &&
        (value as { cachedOnly?: unknown }).cachedOnly === true;
      return (await settings?.toolchain?.check(cachedOnly)) ?? { tools: [] };
    },
    "toolchain.recheck": async () => (await settings?.toolchain?.recheck()) ?? { tools: [] },
    "toolchain.pickPath": async (tool) => {
      const id = text(tool);
      if (id === null) return { status: "failed" };
      return (await settings?.toolchain?.pickPath(id)) ?? { status: "failed" };
    },
    "toolchain.runInstall": (tool) => {
      const id = text(tool);
      if (id !== null) settings?.toolchain?.runInstall(id);
    },
    "cli.status": async () => (await settings?.cli?.status()) ?? unavailableCli,
    "cli.install": async () =>
      (await settings?.cli?.install()) ?? { result: "failed", status: unavailableCli },
    "cli.remove": async () =>
      (await settings?.cli?.remove()) ?? { result: "failed", status: unavailableCli },
    "diagnostics.export": async () => (await settings?.cli?.exportDiagnostics()) ?? { ok: false },
    "agents.status": async () => (await settings?.cli?.agentSkills()) ?? noSkills,
    "agents.install": async (target) =>
      target === "claude" || target === "agents"
        ? ((await settings?.cli?.installAgentSkill(target)) ?? noSkills)
        : noSkills,
    "supervisor.status": async () =>
      (await settings?.cli?.supervisorStatus()) ?? { running: false, cliRuns: 0, tabRuns: 0 },
    "supervisor.stop": async () =>
      (await settings?.cli?.stopSupervisor()) ?? { running: false, cliRuns: 0, tabRuns: 0 },
    "playground.edit": async (value) => {
      const request = parseEditRequest(value);
      return request === null ? rejectedEdit : await controller.edits.edit(request);
    },
    "playground.autoClean": async (value) => {
      if (typeof value !== "object" || value === null) return rejectedEdit;
      const { id, days } = value as Record<string, unknown>;
      const valid = days === null || (Number.isSafeInteger(days) && (days as number) > 0);
      if (text(id) === null || !valid) return rejectedEdit;
      return await controller.edits.autoClean(id as string, days as number | null);
    },
    "playground.duplicate": async (id) => {
      const playground = text(id);
      return playground === null ? rejectedEdit : await controller.edits.duplicate(playground);
    },
    "playground.trash": async (id) => {
      const playground = text(id);
      return playground === null ? rejectedEdit : await controller.edits.trash(playground);
    },
    "playground.forget": async (id) => {
      const playground = text(id);
      return playground === null ? rejectedEdit : await controller.edits.forget(playground);
    },
    "playground.relocate": async (id) => {
      const playground = text(id);
      return playground === null ? rejectedEdit : await controller.edits.relocate(playground);
    },
    "playground.revealParent": (id) => {
      const playground = text(id);
      if (playground !== null) controller.system.revealParent(playground);
    },
    "clean.keep": (ids) => controller.chrome.clean.keep(textList(ids)),
    "clean.later": (ids) => controller.chrome.clean.later(textList(ids)),
    "clean.shown": (ids) => controller.chrome.clean.shown(textList(ids)),
    "link.confirm": () => appLinks?.links.confirm(),
    "link.cancel": () => appLinks?.links.cancel(),
    "update.download": () => appLinks?.updates.download(),
    "update.later": () => appLinks?.updates.later(),
    "notice.dismiss": (id) => {
      const notice = text(id);
      if (notice !== null) controller.chrome.dismissNotice(notice);
    },
    "playground.openTerminal": (id) => {
      const playground = text(id);
      if (playground !== null) controller.system.openTerminal(playground);
    },
    // 请求面板（#187）
    ...requestMethods(controller),
    // 文件服务（#257）；没接线时这些方法不可用
    ...templateMethods(templates),
    ...editorFileMethods(files, openers),
    // 集成终端（#263）；没接线时这些方法不可用
    ...terminalMethods(terminals),
  };

  // 只有本应用自己的界面页面发来的消息才执行：预览页面（任何本机服务）没有预加载脚本，
  // 但仍要在这里把住，防止别的页面伪造发送者
  const trusted = (sender: IpcSender): void => {
    if (!isAppUrl(sender.url)) throw new Error("untrusted sender");
  };

  host.handle(desktopChannels.call, (sender, name, param) => {
    trusted(sender);
    if (typeof name !== "string" || !desktopMethodNames.includes(name as DesktopMethod)) {
      throw new Error("unknown method");
    }
    return methods[name as DesktopMethod](param);
  });
  host.handleSync(desktopChannels.bootstrap, (sender) => {
    trusted(sender);
    const info = typeof bootstrap === "function" ? bootstrap() : bootstrap;
    return new URL(sender.url).searchParams.get("view") === "settings"
      ? { ...info, windowKind: "settings" as const }
      : info;
  });
  const stopState = controller.onChange((state) =>
    host.send(desktopChannels.event, "library.changed", state),
  );
  const stopConsole = controller.onConsole((append) =>
    host.send(desktopChannels.event, "console.appended", append),
  );
  const stopSettings = settings?.onChange((changed) =>
    host.send(desktopChannels.event, "settings.changed", changed),
  );
  const stopToolchain = settings?.toolchain?.onChange(() =>
    host.send(desktopChannels.event, "toolchain.changed", undefined),
  );
  return () => {
    stopState();
    stopConsole();
    stopSettings?.();
    stopToolchain?.();
  };
}

/** 通知界面打开模板选择器（应用菜单的“新建…”） */
export function requestPicker(host: Pick<IpcHost, "send">): void {
  host.send(desktopChannels.event, "picker.open", undefined);
}

/** 通知界面收起或显示侧栏（应用菜单的“切换侧栏”，⌃⌘S） */
export function requestSidebarToggle(host: Pick<IpcHost, "send">): void {
  host.send(desktopChannels.event, "sidebar.toggle", undefined);
}

/** 通知界面执行一条应用命令（应用菜单里的设置、项目操作等，命令此刻没登记就什么都不发生） */
export function requestCommand(host: Pick<IpcHost, "send">, id: CommandId): void {
  host.send(desktopChannels.event, "command.run", { id });
}

/** 通知界面打开命令面板或快速打开（应用菜单的 ⌘⇧P、F1、⌘P） */
export function requestPalette(host: Pick<IpcHost, "send">, mode: "commands" | "files"): void {
  host.send(desktopChannels.event, "palette.open", { mode });
}
