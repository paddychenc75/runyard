import { useT } from "@runyard/i18n/react";
import { Button } from "@runyard/ui";
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
import { ConsolePanelHeader } from "./ConsolePanelHeader.tsx";

export interface ConsolePanelProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 网页/服务默认显示输出，脚本底部只保留终端入口（DESKTOP-TERMINAL-39）。
// 两类都在用户主动打开后才创建终端，避免打开项目就启动 shell。
// “清除”只在“输出”下出现（规格 DESKTOP-WORKSPACE-42）。⌃` 在编辑器和终端之间切换焦点（DESKTOP-TERMINAL-05）。
export function ConsolePanel({ bridge, tab }: ConsolePanelProps) {
  const t = useT();
  const mode = usePanelMode(tab.id);
  const script = tab.kind === "oneshot";
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
  useCommand(
    "app.showOutput",
    script
      ? null
      : () => {
          setPanelMode(tab.id, "output");
          queueMicrotask(() => root.current?.querySelector<HTMLElement>('[role="log"]')?.focus());
        },
  );

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
      <ConsolePanelHeader
        script={script}
        mode={mode}
        onModeChange={(next) =>
          next === "terminal" ? showTerminal() : setPanelMode(tab.id, "output")
        }
        onClear={() => void bridge.call("console.clear", tab.id)}
      />
      {mode === "terminal" ? (
        <TerminalView
          ref={terminal}
          bridge={bridge}
          project={tab.id}
          appearance={appearance}
          focusOnStart={focusOnStart}
          className={styles.body}
        />
      ) : script ? (
        <div className={styles.empty}>
          <Button size="sm" onClick={showTerminal}>
            {t("desktop.console.terminalStart.action")}
          </Button>
        </div>
      ) : (
        <ConsoleOutput bridge={bridge} playground={tab.id} className={styles.log} />
      )}
    </section>
  );
}
