import { useCallback, useEffect, useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { requestEditorFocus } from "../shared/editor-focus.ts";
import type { ShellPage } from "./sidebar-navigation.ts";

/** 设置是页面而非项目标签；打开时不改变项目选择，返回也不触发关闭。 */
export function useSettingsPage(
  bridge: DesktopBridge,
  page: ShellPage,
  setPage: (page: ShellPage) => void,
  activeTab: string,
  openIds: readonly string[],
  projectSelection?: number,
) {
  const selected = useRef(projectSelection);
  useEffect(() => {
    const prior = selected.current;
    selected.current = projectSelection;
    if (prior !== undefined && projectSelection !== undefined && prior !== projectSelection)
      setPage("library");
  }, [projectSelection, setPage]);
  const previous = useRef("library");
  const open = useCallback(() => {
    if (page === "settings") return;
    previous.current = activeTab;
    setPage("settings");
  }, [activeTab, page, setPage]);
  const close = useCallback(() => {
    const target = openIds.includes(previous.current) ? previous.current : "library";
    setPage("library");
    if (target !== activeTab) void bridge.call("tab.select", target);
    if (target !== "library") requestAnimationFrame(requestEditorFocus);
  }, [activeTab, bridge, openIds, setPage]);
  useEffect(() => {
    void bridge.call("settings.pageActive", page === "settings");
  }, [bridge, page]);
  useEffect(() => {
    if (page !== "settings") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const pressed = bridge.bootstrap.modKey === "meta" ? event.metaKey : event.ctrlKey;
      if (!pressed || event.altKey || event.shiftKey || event.key.toLowerCase() !== "w") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [bridge, close, page]);
  return { open, close };
}
