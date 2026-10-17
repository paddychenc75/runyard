import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { FileTree } from "./file-tree/FileTree.tsx";
import { useWorkspaceFiles } from "./use-workspace-files.ts";

export interface TabContentProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 项目标签页左边的一栏：文件树（设计稿 Web、Script 的“文件”面板）。编辑器和文件标签在它右边（#259）。
// 运行状态和停止/运行按钮在顶栏的运行条（RunBar，#176），预览或脚本输出在右边，控制台在底部。
export function TabContent({ bridge, tab }: TabContentProps) {
  const host = useWorkspaceFiles();
  return <FileTree bridge={bridge} project={tab.id} host={host} />;
}
