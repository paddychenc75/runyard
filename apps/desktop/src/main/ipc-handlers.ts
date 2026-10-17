import {
  type BootstrapInfo,
  type CreateRequest,
  type CreateResult,
  type DesktopMethod,
  desktopChannels,
  desktopMethodNames,
  type QuitReply,
} from "../shared/desktop-bridge.ts";
import type { Bounds } from "../shared/layout.ts";
import { isAppUrl } from "./app-protocol.ts";
import { editorFileMethods, type FileOpeners } from "./editor-files/editor-ipc.ts";
import type { EditorFileService } from "./editor-files/file-service.ts";
import type { LibraryController } from "./library-controller.ts";
import type { QuitFlushGate } from "./quit-flush-gate.ts";
import type { SettingsController } from "./settings-controller.ts";

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

/** 退出回执：形状不对一律不要（页面发来的数据不可信） */
function parseQuitReply(value: unknown): QuitReply | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, reply } = value as Record<string, unknown>;
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  if (reply !== "ack" && reply !== "proceed" && reply !== "cancel") return null;
  return { id, reply };
}

const rejectedCreate: CreateResult = { ok: false, error: { code: "INTERNAL", params: {} } };

/** 占位区的矩形：四个有限的数，宽高不为负；其他形状一律不要（页面发来的数据不可信） */
function parseBounds(value: unknown): Bounds | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  const numbers = [x, y, width, height];
  if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if ((width as number) < 0 || (height as number) < 0) return null;
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

/** 注册全部通道，并把状态变化推给界面；返回停止推送的函数 */
export function registerBridgeHandlers(
  host: IpcHost,
  controller: LibraryController,
  bootstrap: BootstrapInfo,
  files?: EditorFileService,
  openers?: FileOpeners,
  quitGate?: QuitFlushGate,
  settings?: SettingsController,
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
    "tab.open": async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.openProject(playground);
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
      if (reply !== null) quitGate?.reply(reply);
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
      if (playground !== null) controller.revealFolder(playground);
    },
    "playground.copyPath": (id) => {
      const playground = text(id);
      if (playground !== null) controller.copyFolderPath(playground);
    },
    "clipboard.copy": (value) => {
      if (typeof value === "string") controller.copyText(value);
    },
    "link.open": (value) => {
      if (typeof value === "string") controller.openLink(value);
    },
    "playground.create": async (value) => {
      const request = parseCreateRequest(value);
      return request === null ? rejectedCreate : await controller.create(request);
    },
    // 设置页（#188）；没接线时设置读不到，界面显示默认值
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
    // 文件服务（#257）；没接线时这些方法不可用
    ...editorFileMethods(files, openers),
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
    return bootstrap;
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
  return () => {
    stopState();
    stopConsole();
    stopSettings?.();
  };
}

/** 通知界面打开模板选择器（应用菜单的“新建…”） */
export function requestPicker(host: Pick<IpcHost, "send">): void {
  host.send(desktopChannels.event, "picker.open", undefined);
}
