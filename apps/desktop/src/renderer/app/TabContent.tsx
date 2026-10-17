import type { ReactNode } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { EditorColumn } from "../features/editor/EditorColumn.tsx";
import { useEditorFileHooks } from "../features/editor/EditorWorkspace.tsx";
import { FileTree } from "./file-tree/FileTree.tsx";

export interface TabContentProps {
  bridge: DesktopBridge;
  tab: TabRow;
  /** 文件树收起时（规格 DESKTOP-WORKSPACE-60）：树不画，窄条里放“展开”按钮 */
  collapsedRail?: ReactNode;
  onCollapseTree?: () => void;
  /** 文件树和编辑器之间的分隔条（规格 DESKTOP-WORKSPACE-55） */
  treeHandle?: ReactNode;
  /** 给了就由它摆编辑器和右边的各面板（设计稿里文件树是整高的一列，输出面板只在它右边）；不给就只有编辑器 */
  children?: (editor: ReactNode) => ReactNode;
}

// 项目标签页左边的两栏：文件树（#258，设计稿的“文件”面板）和编辑器（#259，文件标签和代码）。
// 两边靠 WorkspaceFilesContext（EditorWorkspace 提供）通信：树只调 openFile、读选中的文件；
// 改名、移到废纸篓、未保存的内容这三件事经 useEditorFileHooks 接到文件标签上。
// 运行状态和停止/运行按钮在顶栏的运行条（RunBar，#176），预览或脚本输出在右边，控制台在底部。
export function TabContent({
  bridge,
  tab,
  collapsedRail,
  onCollapseTree,
  treeHandle,
  children,
}: TabContentProps) {
  const hooks = useEditorFileHooks();
  const collapsed = collapsedRail !== undefined;
  const editor = <EditorColumn bridge={bridge} tab={tab} />;
  return (
    <>
      {collapsed ? (
        collapsedRail
      ) : (
        <>
          <FileTree bridge={bridge} project={tab.id} hooks={hooks} onCollapse={onCollapseTree} />
          {treeHandle}
        </>
      )}
      {children === undefined ? editor : children(editor)}
    </>
  );
}
