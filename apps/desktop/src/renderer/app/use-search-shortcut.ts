import { type RefObject, useEffect } from "react";

// ⌘F 在资源库页把焦点放进搜索框（规格 DESKTOP-LIBRARY-VIEW-14）；项目标签页没有搜索框，不拦
export function useSearchShortcut(
  enabled: boolean,
  modKey: "meta" | "ctrl",
  searchRef: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      const pressed = modKey === "meta" ? event.metaKey : event.ctrlKey;
      if (!pressed || event.key.toLowerCase() !== "f" || event.altKey || event.shiftKey) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, modKey, searchRef]);
}
