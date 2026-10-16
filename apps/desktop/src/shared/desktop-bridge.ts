import type { LibraryState } from "./library-state.ts";

// 预加载脚本交给界面的窄接口：几个动作加一个状态订阅，没有别的。
// 动作的失败不抛给界面，折进状态里的 error（代码加参数）。

export const desktopChannels = {
  getState: "desktop:get-state",
  start: "desktop:start",
  stop: "desktop:stop",
  select: "desktop:select",
  create: "desktop:create",
  stateChanged: "desktop:state-changed",
} as const;

export interface DesktopBridge {
  getState(): Promise<LibraryState>;
  /** 返回取消订阅的函数 */
  onState(listener: (state: LibraryState) => void): () => void;
  start(playgroundId: string): Promise<void>;
  stop(playgroundId: string): Promise<void>;
  /** 让预览区显示这个项目；null 是不看任何项目 */
  select(playgroundId: string | null): Promise<void>;
  create(templateId: string): Promise<void>;
}
