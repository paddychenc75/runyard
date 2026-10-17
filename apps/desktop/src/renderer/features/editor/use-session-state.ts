import { useSyncExternalStore } from "react";
import type { EditorSession, SessionState } from "./editor-session.ts";

const EMPTY: SessionState = { tabs: [], active: null, closePrompt: null };
const noSubscribe = (): (() => void) => () => {};

/** 订阅一个编辑会话的状态；没有会话（资源库标签）是空状态 */
export function useSessionState(session: EditorSession | undefined): SessionState {
  return useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.getState ?? (() => EMPTY),
  );
}
