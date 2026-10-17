import { useEffect, useState } from "react";
import type { EditorTheme } from "./monaco-host.ts";

// 编辑器配色跟着应用现在用的主题走：外框把 data-theme（system、light、dark）写在 <html> 上，
// 跟随系统时再看系统的明暗。运行中改主题时立即换，不用重新打开文件（规格 DESKTOP-EDITOR-39）。

function resolve(): EditorTheme {
  const setting = document.documentElement.dataset.theme;
  if (setting === "dark") return "dark";
  if (setting === "light") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useAppliedTheme(): EditorTheme {
  const [theme, setTheme] = useState<EditorTheme>(resolve);
  useEffect(() => {
    const update = () => setTheme(resolve());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", update);
    };
  }, []);
  return theme;
}
