import { createRoot } from "react-dom/client";
import "@runyard/tokens/tokens.css";
import "@runyard/ui/styles/reset.css";
import "@runyard/ui/styles/base.css";
import { App } from "./app/App.tsx";
import { getDesktopBridge } from "./bridge/desktop-bridge.ts";

// 界面入口。只用预加载脚本交出来的 window.runyard（经 bridge/），没有别的通向主进程的路。
const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<App bridge={getDesktopBridge()} />);
