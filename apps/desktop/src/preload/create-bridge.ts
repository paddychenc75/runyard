import { type DesktopBridge, desktopChannels } from "../shared/desktop-bridge.ts";
import type { LibraryState } from "../shared/library-state.ts";

// 预加载脚本里唯一的逻辑：把 ipcRenderer 包成窄接口。ipcRenderer 以 IpcRendererLike 传进来，测试里换成假的。
// 界面拿不到 ipcRenderer 本身，也就发不出任意通道的消息。

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export function createBridge(ipc: IpcRendererLike): DesktopBridge {
  return {
    getState: () => ipc.invoke(desktopChannels.getState) as Promise<LibraryState>,
    onState(listener) {
      const forward = (_event: unknown, state: unknown) => listener(state as LibraryState);
      ipc.on(desktopChannels.stateChanged, forward);
      return () => ipc.removeListener(desktopChannels.stateChanged, forward);
    },
    async start(playgroundId) {
      await ipc.invoke(desktopChannels.start, playgroundId);
    },
    async stop(playgroundId) {
      await ipc.invoke(desktopChannels.stop, playgroundId);
    },
    async select(playgroundId) {
      await ipc.invoke(desktopChannels.select, playgroundId);
    },
    async create(templateId) {
      await ipc.invoke(desktopChannels.create, templateId);
    },
  };
}
