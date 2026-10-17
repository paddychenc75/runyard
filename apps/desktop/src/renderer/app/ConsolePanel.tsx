import { useT } from "@runyard/i18n/react";
import { Button, SegmentedControl } from "@runyard/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { useAppliedTheme } from "../features/editor/use-applied-theme.ts";
import { setPanelMode, usePanelMode } from "../features/terminal/panel-mode.ts";
import { TerminalView, type TerminalViewHandle } from "../features/terminal/TerminalView.tsx";
import { useCommand } from "../shared/command-host.tsx";
import { requestEditorFocus } from "../shared/editor-focus.ts";
import { ConsoleOutput } from "./ConsoleOutput.tsx";
import styles from "./ConsolePanel.module.css";

export interface ConsolePanelProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 标签页底部的面板（设计稿 WebLight、Script 的“输出 / 终端”）：默认是“输出”，实时显示这次运行的进程输出，
// 包括安装和启动阶段；点“终端”才创建这个项目的终端（规格 DESKTOP-TERMINAL-01）。
// “清除”只在“输出”下出现（规格 DESKTOP-WORKSPACE-42）。⌃` 在编辑器和终端之间切换焦点（DESKTOP-TERMINAL-05）。
export function ConsolePanel({ bridge, tab }: ConsolePanelProps) {
  const t = useT();
  const mode = usePanelMode(tab.id);
  const appearance = useAppliedTheme();
  const root = useRef<HTMLElement>(null);
  const terminal = useRef<TerminalViewHandle>(null);
  // 用户主动切到终端时，接上后把焦点放进去；恢复标签页、切回标签页时不抢焦点
  const [focusOnStart, setFocusOnStart] = useState(false);

  const showTerminal = useCallback(() => {
    setFocusOnStart(true);
    setPanelMode(tab.id, "terminal");
  }, [tab.id]);

  // 命令面板的“显示终端”“显示输出”（规格“命令面板”）；切回“输出”后把焦点放进日志，方向键就能翻看
  useCommand("app.showTerminal", showTerminal);
  useCommand("app.showOutput", () => {
    setPanelMode(tab.id, "output");
    queueMicrotask(() => root.current?.querySelector<HTMLElement>('[role="log"]')?.focus());
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.key !== "`") return;
      event.preventDefault();
      event.stopPropagation();
      if (mode === "terminal" && terminal.current?.hasFocus() === true) {
        // 焦点已在终端里：还给编辑器，分段切换保持在“终端”
        requestEditorFocus();
      } else if (mode === "terminal") {
        terminal.current?.focus();
      } else {
        showTerminal();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode, showTerminal]);

  return (
    <section ref={root} className={styles.root} data-console={tab.id}>
      <header className={styles.header}>
        <SegmentedControl
          label={t("desktop.console.tabs.aria")}
          items={[
            { value: "output", label: t("desktop.console.tab.label") },
            { value: "terminal", label: t("desktop.console.terminal.label") },
          ]}
          value={mode}
          onValueChange={(next) => {
            if (next === "terminal") showTerminal();
            else setPanelMode(tab.id, "output");
          }}
        />
        {mode === "output" ? (
          <Button size="sm" onClick={() => void bridge.call("console.clear", tab.id)}>
            {t("desktop.console.clear.action")}
          </Button>
        ) : null}
      </header>
      {mode === "terminal" ? (
        <TerminalView
          ref={terminal}
          bridge={bridge}
          project={tab.id}
          appearance={appearance}
          focusOnStart={focusOnStart}
          className={styles.body}
        />
      ) : (
        <ConsoleOutput bridge={bridge} playground={tab.id} className={styles.log} />
      )}
    </section>
  );
}
