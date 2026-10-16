import { contextBridge, ipcRenderer } from "electron";
import { applyBootstrapWhenReady, createBridge, type DocumentLike } from "./create-bridge.ts";

// 预加载脚本没有 DOM 类型；MutationObserver 只用来等 <html> 出现
declare const document: DocumentLike & { readyState: string };
declare class MutationObserver {
  constructor(callback: () => void);
  observe(target: unknown, options: { childList: boolean }): void;
  disconnect(): void;
}

// 预加载脚本（构建成 CommonJS：沙箱里的预加载脚本不能是 ES 模块）。只暴露一个对象 runyard。
const bridge = createBridge(ipcRenderer);
applyBootstrapWhenReady(document, bridge.bootstrap, (attempt) => {
  const observer = new MutationObserver(() => {
    if (attempt()) observer.disconnect();
  });
  observer.observe(document, { childList: true });
});
contextBridge.exposeInMainWorld("runyard", bridge);
