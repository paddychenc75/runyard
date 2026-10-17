import { createRoot } from "react-dom/client";
import "@runyard/tokens/tokens.css";
import "@runyard/ui/styles/reset.css";
import "@runyard/ui/styles/base.css";
import { App } from "./app/App.tsx";
import { getDesktopBridge } from "./bridge/desktop-bridge.ts";
import { preloadEditorWhenIdle } from "./editor/editor-loader.ts";

// 界面入口。只用预加载脚本交出来的 window.runyard（经 bridge/），没有别的通向主进程的路。
const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<App bridge={getDesktopBridge()} />);
// 编辑器（约 5 MB）在界面画好后的空闲时预加载，第一次打开文件时它已经就绪
preloadEditorWhenIdle();
