import { contextBridge, ipcRenderer } from "electron";
import { createBridge } from "./create-bridge.ts";

// 预加载脚本（构建成 CommonJS：沙箱里的预加载脚本不能是 ES 模块）。只暴露一个对象 runyard。
contextBridge.exposeInMainWorld("runyard", createBridge(ipcRenderer));
