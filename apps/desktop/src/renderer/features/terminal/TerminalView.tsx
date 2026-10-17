import { useT } from "@runyard/i18n/react";
import { Button, Menu, type MenuEntry } from "@runyard/ui";
import "@xterm/xterm/css/xterm.css";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { FALLBACK_SHELL, type TerminalState } from "../../../shared/terminal.ts";
import { useOverlay } from "../../shared/overlay-context.tsx";
import { FindBar } from "./FindBar.tsx";
import styles from "./TerminalView.module.css";
import { type FindResults, TerminalSession } from "./terminal-session.ts";
import { endedMessage, failureBranch } from "./terminal-text.ts";
import type { TerminalAppearance } from "./terminal-theme.ts";

export interface TerminalViewHandle {
  focus(): void;
  hasFocus(): boolean;
}

export interface TerminalViewProps {
  bridge: DesktopBridge;
  project: string;
  appearance: TerminalAppearance;
  /** 刚由用户切到“终端”（点分段切换或 ⌃`）：接上后把焦点放进终端 */
  focusOnStart: boolean;
  className?: string;
}

const NO_RESULTS: FindResults = { index: -1, count: 0 };

// 一个项目的终端（设计稿 Terminal、TerminalEnded、TerminalFind、TerminalMenu）：xterm 加查找栏、
// 右键菜单和“终端已结束”一行。显示它才会创建终端；卸载只是断开，终端不结束（规格 DESKTOP-TERMINAL-03）。
export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(
  { bridge, project, appearance, focusOnStart, className },
  ref,
) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const [state, setState] = useState<TerminalState>({ kind: "none" });
  const [cursorRow, setCursorRow] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [results, setResults] = useState<FindResults>(NO_RESULTS);
  const [menu, setMenu] = useState<{ x: number; y: number; copyable: boolean } | null>(null);
  useOverlay(menu !== null);

  // 创建会话的 effect 只在项目变时重跑，要用的最新值放进引用
  const latest = useRef({ t, appearance, focusOnStart });
  latest.current = { t, appearance, focusOnStart };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => sessionRef.current?.focus(),
      hasFocus: () => sessionRef.current?.hasFocus() ?? false,
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const session = new TerminalSession({
      bridge,
      project,
      host,
      appearance: latest.current.appearance,
      noticeText: (next) =>
        next.kind === "running" && next.notice !== undefined
          ? String(
              latest.current.t("desktop.terminal.shellFallback.label", {
                shell: next.notice.shell,
                reason: failureBranch(next.notice.reason),
                fallback: FALLBACK_SHELL,
              }),
            )
          : null,
      callbacks: {
        state: setState,
        findResults: setResults,
        cursorRow: setCursorRow,
        findRequested: () => setFindOpen(true),
        contextMenu: ({ x, y }) => setMenu({ x, y, copyable: session.hasSelection() }),
      },
    });
    sessionRef.current = session;
    void session.start().then(() => {
      if (latest.current.focusOnStart) session.focus();
    });
    return () => {
      sessionRef.current = null;
      session.dispose();
    };
  }, [bridge, project]);

  useEffect(() => {
    sessionRef.current?.setAppearance(appearance);
  }, [appearance]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setResults(NO_RESULTS);
    sessionRef.current?.endFind();
    sessionRef.current?.focus();
  }, []);

  const entries: MenuEntry[] = [
    {
      id: "copy",
      label: t("desktop.terminalMenu.copy.action"),
      hint: t("desktop.terminalMenu.copy.hint"),
      disabled: menu?.copyable !== true,
    },
    {
      id: "paste",
      label: t("desktop.terminalMenu.paste.action"),
      hint: t("desktop.terminalMenu.paste.hint"),
    },
    {
      id: "selectAll",
      label: t("desktop.terminalMenu.selectAll.action"),
      hint: t("desktop.terminalMenu.selectAll.hint"),
    },
    { type: "separator" },
    {
      id: "clear",
      label: t("desktop.terminalMenu.clear.action"),
      hint: t("desktop.terminalMenu.clear.hint"),
    },
  ];

  const ended = endedMessage(state);
  return (
    <section
      aria-label={t("desktop.terminal.aria")}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      <div className={styles.pad}>
        <div ref={hostRef} className={styles.host} data-terminal-host="" />
      </div>
      {ended === null ? null : (
        <div className={styles.ended} style={{ "--terminal-ended-row": cursorRow } as never}>
          <span className={styles.endedText}>
            {ended.key === "exited"
              ? t("desktop.terminal.endedExited.label", { exitCode: ended.exitCode })
              : ended.key === "signal"
                ? t("desktop.terminal.endedSignal.label")
                : ended.key === "hostCrashed"
                  ? t("desktop.terminal.endedHostCrashed.label")
                  : ended.key === "renamed"
                    ? t("desktop.terminal.endedRenamed.label")
                    : t("desktop.terminal.endedStartFailed.label")}
          </span>
          <Button
            size="sm"
            icon="prompt"
            className={styles.reopen}
            onClick={() => void sessionRef.current?.reopen()}
          >
            {t("desktop.terminal.reopen.action")}
          </Button>
        </div>
      )}
      {findOpen ? (
        <FindBar
          results={results}
          onQuery={(text, options) => sessionRef.current?.setQuery(text, options)}
          onStep={(direction) => sessionRef.current?.findStep(direction)}
          onClose={closeFind}
        />
      ) : null}
      {menu === null ? null : (
        <Menu
          label={t("desktop.terminalMenu.aria")}
          align="start"
          className={styles.menu}
          open
          trigger={
            <span
              className={styles.menuAnchor}
              style={{ "--menu-x": `${menu.x}px`, "--menu-y": `${menu.y}px` } as never}
            />
          }
          entries={entries}
          onOpenChange={(open) => {
            if (!open) {
              setMenu(null);
              sessionRef.current?.focus();
            }
          }}
          onSelect={(id) => {
            setMenu(null);
            const session = sessionRef.current;
            if (session === null) return;
            if (id === "copy") void session.run("copy");
            else if (id === "paste") void session.run("paste");
            else if (id === "selectAll") void session.run("selectAll");
            else if (id === "clear") void session.run("clear");
            session.focus();
          }}
        />
      )}
    </section>
  );
});
