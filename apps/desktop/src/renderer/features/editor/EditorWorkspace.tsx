import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { WorkspaceFilesContext } from "../../shared/workspace-files.tsx";
import type { AutosaveMode, EditorSession, SessionState } from "./editor-session.ts";
import { EditorSessions } from "./editor-sessions.ts";
import { useSessionState } from "./use-session-state.ts";

// 外壳最外面包一层：为每个打开的项目标签管着一个编辑会话，并把当前项目的会话交给
// 文件树（经 WorkspaceFilesContext，#258）和编辑器（经 EditorSessionContext，下面的 EditorColumn）。
// 资源库标签上没有会话，文件树调用的 openFile 什么都不做。

export interface ActiveEditor {
  session: EditorSession;
  state: SessionState;
}
const EditorSessionContext = createContext<ActiveEditor | null>(null);

export function useActiveEditor(): ActiveEditor {
  const value = useContext(EditorSessionContext);
  // i18n-allow: 开发者诊断，接线错误时才会抛，不显示给用户
  if (value === null) throw new Error("EditorColumn 要放在 EditorWorkspace 里，且当前是项目标签");
  return value;
}

export interface EditorWorkspaceProps {
  bridge: DesktopBridge;
  /** 打开着的项目标签 */
  tabs: readonly TabRow[];
  /** 当前标签：资源库是 "library"，项目标签是项目 id */
  activeTab: string;
  /** 自动保存的档位（设置页随 #260）；现在由外壳给，默认“关闭”只靠 ⌘S 写入 */
  autosave?: () => AutosaveMode;
  children: ReactNode;
}

const DEFAULT_AUTOSAVE: () => AutosaveMode = () => "off";

export function EditorWorkspace({
  bridge,
  tabs,
  activeTab,
  autosave = DEFAULT_AUTOSAVE,
  children,
}: EditorWorkspaceProps) {
  const [sessions] = useState(() => new EditorSessions(bridge, autosave));
  const activeRow = tabs.find((tab) => tab.id === activeTab);
  const session = activeRow === undefined ? undefined : sessions.ensure(activeRow);
  useEffect(() => sessions.retain(new Set(tabs.map((tab) => tab.id))), [sessions, tabs]);
  const state = useSessionState(session);
  const files = useMemo(
    () => ({
      activePath: state.active,
      openPaths: state.tabs.map((tab) => tab.path),
      openFile: (path: string) => void session?.openFile(path),
    }),
    [state, session],
  );
  const active = useMemo(
    () => (session === undefined ? null : { session, state }),
    [session, state],
  );
  return (
    <WorkspaceFilesContext.Provider value={files}>
      <EditorSessionContext.Provider value={active}>{children}</EditorSessionContext.Provider>
    </WorkspaceFilesContext.Provider>
  );
}
