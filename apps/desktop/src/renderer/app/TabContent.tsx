import { useMemo, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { type WorkspaceFiles, WorkspaceFilesContext } from "../shared/workspace-files.tsx";
import { FileTree, type FileTreeHooks } from "./file-tree/FileTree.tsx";

export interface TabContentProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

const underPath = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`);

// 项目标签页左边的一栏：文件树（设计稿 Web、Script 的“文件”面板）。编辑器和文件标签在它右边（#259）。
// 运行状态和停止/运行按钮在顶栏的运行条（RunBar，#176），预览或脚本输出在右边，控制台在底部。
// “打开着哪个文件”现在由这里的最小占位提供；#259 合并后换成编辑器的状态（同一个 WorkspaceFilesContext），
// 并把 hooks 里的三件事（改名、移走、未保存内容）接到文件标签上。
export function TabContent({ bridge, tab }: TabContentProps) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const files = useMemo<WorkspaceFiles>(
    () => ({
      activePath,
      openPaths: activePath === null ? [] : [activePath],
      openFile: setActivePath,
    }),
    [activePath],
  );
  const hooks = useMemo<FileTreeHooks>(
    () => ({
      onRenamed: (from, to) => setActivePath((now) => (now === from ? to : now)),
      onTrashed: (path) =>
        setActivePath((now) => (now !== null && underPath(now, path) ? null : now)),
    }),
    [],
  );
  return (
    <WorkspaceFilesContext.Provider value={files}>
      <FileTree bridge={bridge} project={tab.id} hooks={hooks} />
    </WorkspaceFilesContext.Provider>
  );
}
