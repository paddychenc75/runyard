import { createContext, useContext } from "react";

// 项目标签页里“文件树”和“编辑器”之间唯一的接缝（#258 文件树，#259 编辑器与文件标签）：
// 文件树只通过它让编辑器打开文件、读当前选中的文件，不导入编辑器模块（功能模块之间不互相导入）。
// 路径一律是项目内相对路径（正斜杠，如 "src/App.tsx"），与 files.* 方法的路径一致。
export interface WorkspaceFiles {
  /** 当前选中的文件标签对应的文件；没有打开的文件是 null（文件树据此高亮） */
  activePath: string | null;
  /** 已打开的文件，按文件标签的顺序 */
  openPaths: readonly string[];
  /** 为文件开文件标签；已有就切过去，不再开一个（规格 DESKTOP-EDITOR-15） */
  openFile(relativePath: string): void;
}

export const WorkspaceFilesContext = createContext<WorkspaceFiles | null>(null);

/** 文件树调用；没有外层提供者说明接线错了，直接报错而不是静默什么都不做 */
export function useWorkspaceFiles(): WorkspaceFiles {
  const value = useContext(WorkspaceFilesContext);
  // i18n-allow: 开发者诊断，接线错误时才会抛，不显示给用户
  if (value === null) throw new Error("useWorkspaceFiles 要放在 WorkspaceFilesContext 里");
  return value;
}
