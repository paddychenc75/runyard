import {
  type BootstrapInfo,
  type DesktopBridge,
  type DesktopEventName,
  type DesktopMethod,
  desktopChannels,
  desktopEventNames,
  desktopMethodNames,
} from "../shared/desktop-bridge.ts";

// 预加载脚本里唯一的逻辑：把 ipcRenderer 包成白名单接口。ipcRenderer 以 IpcRendererLike 传进来，测试里换成假的。
// 界面拿不到 ipcRenderer 本身，也就发不出任意通道的消息；方法名、事件名不在表里的直接拒绝。

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  sendSync(channel: string, ...args: unknown[]): unknown;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export function createBridge(ipc: IpcRendererLike): DesktopBridge {
  const bootstrap = ipc.sendSync(desktopChannels.bootstrap) as BootstrapInfo;
  return {
    bootstrap,
    call(method: DesktopMethod, ...param: unknown[]) {
      if (!desktopMethodNames.includes(method)) {
        return Promise.reject(new Error("unknown method"));
      }
      return ipc.invoke(desktopChannels.call, method, param[0]) as Promise<never>;
    },
    on(event: DesktopEventName, listener: (payload: never) => void) {
      if (!desktopEventNames.includes(event)) throw new Error("unknown event");
      const forward = (_event: unknown, name: unknown, payload: unknown) => {
        if (name === event) listener(payload as never);
      };
      ipc.on(desktopChannels.event, forward);
      return () => ipc.removeListener(desktopChannels.event, forward);
    },
  } as DesktopBridge;
}

/** 在页面脚本运行前把平台、主题、语言写到 <html> 上，界面第一帧就是对的（不闪） */
/** 预加载脚本没有 DOM 类型，只写用到的那几个属性 */
export interface RootElementLike {
  dataset: Record<string, string | undefined>;
  lang: string;
}

export function applyBootstrap(root: RootElementLike, info: BootstrapInfo): void {
  root.dataset.platform = info.platform;
  root.dataset.theme = info.theme;
  root.lang = info.locale;
}

export interface DocumentLike {
  documentElement: RootElementLike | null;
}

/**
 * 预加载脚本跑的时候 <html> 可能还没建好（文档刚创建）：没有就等文档长出根元素再写，
 * 页面脚本在此之后才执行，所以界面第一帧属性已经是对的。
 */
export function applyBootstrapWhenReady(
  doc: DocumentLike,
  info: BootstrapInfo,
  watch: (attempt: () => boolean) => void,
): void {
  const attempt = (): boolean => {
    if (doc.documentElement === null) return false;
    applyBootstrap(doc.documentElement, info);
    return true;
  };
  if (!attempt()) watch(attempt);
}
