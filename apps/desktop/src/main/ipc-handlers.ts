import { desktopChannels } from "../shared/desktop-bridge.ts";
import type { LibraryState } from "../shared/library-state.ts";
import { isAppUrl } from "./app-protocol.ts";
import type { LibraryController } from "./library-controller.ts";

// 把界面发来的消息接到控制器上。Electron 的 ipcMain 通过 IpcHost 这个接口传进来，测试里换成假的。

export interface IpcSender {
  /** 发消息的页面地址 */
  url: string;
}

export interface IpcHost {
  handle(channel: string, handler: (sender: IpcSender, ...args: unknown[]) => unknown): void;
  send(channel: string, state: LibraryState): void;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** 注册全部通道，并把状态变化推给界面；返回停止推送的函数 */
export function registerBridgeHandlers(host: IpcHost, controller: LibraryController): () => void {
  // 只有本应用自己的界面页面发来的消息才执行：预览页面（任何本机服务）没有预加载脚本，
  // 但仍要在这里把住，防止别的页面伪造发送者
  const guarded =
    (handler: (...args: unknown[]) => unknown) =>
    (sender: IpcSender, ...args: unknown[]): unknown => {
      if (!isAppUrl(sender.url)) throw new Error("untrusted sender");
      return handler(...args);
    };

  host.handle(
    desktopChannels.getState,
    guarded(() => controller.getState()),
  );
  host.handle(
    desktopChannels.start,
    guarded(async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.startRun(playground);
    }),
  );
  host.handle(
    desktopChannels.stop,
    guarded(async (id) => {
      const playground = text(id);
      if (playground !== null) await controller.stopRun(playground);
    }),
  );
  host.handle(
    desktopChannels.select,
    guarded(async (id) => {
      await controller.select(id === null ? null : text(id));
    }),
  );
  host.handle(
    desktopChannels.create,
    guarded(async (id) => {
      const template = text(id);
      if (template !== null) await controller.create(template);
    }),
  );
  return controller.onChange((state) => host.send(desktopChannels.stateChanged, state));
}
