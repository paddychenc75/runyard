import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { WorkspaceFilesContext } from "../../shared/workspace-files.tsx";
import type { EditorSession } from "./editor-session.ts";
import { EditorSessions } from "./editor-sessions.ts";
import type { AutosaveMode, SessionState } from "./session-types.ts";
import { useSessionState } from "./use-session-state.ts";

// 外壳最外面包一层：为每个打开的项目标签管着一个编辑会话，并把当前项目的会话交给
// 文件树（经 WorkspaceFilesContext，#258）和编辑器（经 EditorSessionContext，下面的 EditorColumn）。
// 资源库标签上没有会话，文件树调用的 openFile 什么都不做。

export interface ActiveEditor {
  session: EditorSession;
  state: SessionState;
}
const EditorSessionContext = createContext<ActiveEditor | null>(null);

const FlushProjectContext = createContext<(id: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

/** 关闭项目标签页之前调用：未保存的修改先写入或询问，false = 中止关闭（DESKTOP-EDITOR-27） */
export function useFlushProject(): (id: string) => Promise<boolean> {
  return useContext(FlushProjectContext);
}

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
  /** 自动保存的档位；设置页（#188）做出来之前不传，用默认的“停止输入 1 秒后” */
  autosave?: () => AutosaveMode;
  children: ReactNode;
}

const DEFAULT_AUTOSAVE: () => AutosaveMode = () => "delay";

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
  // 退出前（⌘Q）：先回 ack，再把所有项目的未保存修改写入或询问，最后告诉主进程能不能退
  useEffect(
    () =>
      bridge.on("app.quitRequested", ({ id }) => {
        void bridge.call("app.quitReply", { id, reply: "ack" });
        void sessions
          .flushAll()
          .then((proceed) =>
            bridge.call("app.quitReply", { id, reply: proceed ? "proceed" : "cancel" }),
          );
      }),
    [bridge, sessions],
  );
  const flushProject = useCallback((id: string) => sessions.flushProject(id), [sessions]);
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
      <FlushProjectContext.Provider value={flushProject}>
        <EditorSessionContext.Provider value={active}>{children}</EditorSessionContext.Provider>
      </FlushProjectContext.Provider>
    </WorkspaceFilesContext.Provider>
  );
}

/** 文件树要的三件事（改名、移到废纸篓、未保存的内容）接到当前项目的文件标签上 */
export function useEditorFileHooks(): {
  unsavedContent: (path: string) => string | undefined;
  onRenamed: (from: string, to: string) => void;
  onTrashed: (path: string) => void;
} {
  const { session } = useActiveEditor();
  return useMemo(
    () => ({
      unsavedContent: (path) => session.unsavedContent(path),
      onRenamed: (from, to) => session.renamePath(from, to),
      onTrashed: (path) => session.removePath(path),
    }),
    [session],
  );
}
