import { useT } from "@runyard/i18n/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { useCommands } from "../../shared/command-host.tsx";
import { useContentVisible } from "../../shared/content-visibility.ts";
import { onEditorFocusRequest } from "../../shared/editor-focus.ts";
import { useOverlay } from "../../shared/overlay-context.tsx";
import { ClosePrompt } from "./ClosePrompt.tsx";
import { watchContextMenu } from "./context-menu-theme.ts";
import { EditorBar } from "./EditorBar.tsx";
import { EditorBreadcrumb } from "./EditorBreadcrumb.tsx";
import styles from "./EditorColumn.module.css";
import { useActiveEditor } from "./EditorWorkspace.tsx";
import { FileNotice } from "./FileNotice.tsx";
import { FileTabs } from "./FileTabs.tsx";
import { editorLanguageOf } from "./file-language.ts";
import { type FileTab, isDirty } from "./file-tab.ts";
import { type FormatMenuLabels, formatSupport } from "./format-support.ts";
import {
  createMonacoHost,
  type EditorHost,
  type EditorHostFactory,
  type EditorOperation,
} from "./monaco-host.ts";
import { baseName } from "./path-names.ts";
import { bridgeProjectSource } from "./project-source.ts";
import { SaveStatus, type SaveStatusKind } from "./SaveStatus.tsx";
import { useAppliedTheme } from "./use-applied-theme.ts";
import { useVueUsable } from "./use-vue-usable.ts";

function statusOf(tab: FileTab): SaveStatusKind {
  if (tab.saveError !== null) return "failed";
  if (tab.conflict) return "conflict";
  if (tab.deleted) return "deleted";
  if (tab.saving) return "saving";
  return isDirty(tab) ? "unsaved" : "saved";
}

export interface EditorColumnProps {
  bridge: DesktopBridge;
  tab: TabRow;
  /** 编辑器的装配，测试里换成假的（Monaco 在 jsdom 里画不出来） */
  createHost?: EditorHostFactory;
}

// 项目标签页里的编辑器卡片（设计稿 WebLight、Script）：文件标签条加保存状态、面包屑、代码区。
// ⌘S 和 ⌘W 在整个窗口层面接（捕获阶段），所以焦点在不在编辑器里都一样；⌘W 先关文件标签，
// 没有文件标签了才放行给标签条去关项目标签页（规格 DESKTOP-EDITOR-17）。
export function EditorColumn({ bridge, tab, createHost = createMonacoHost }: EditorColumnProps) {
  const t = useT();
  const visible = useContentVisible();
  const { session, state } = useActiveEditor();
  const theme = useAppliedTheme();
  const rootRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorHost | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = state.tabs.find((candidate) => candidate.path === state.active) ?? null;
  const { modKey, locale } = bridge.bootstrap;
  const vueUsable = useVueUsable(bridge, tab.id);
  // 右键菜单里“格式化文档”不可用时的文字，按原因各一条（规格 DESKTOP-EDITOR-96、98）
  const formatLabels = useMemo<FormatMenuLabels>(
    () => ({
      python: t("desktop.editor.formatBlockedPython.label"),
      go: t("desktop.editor.formatBlockedGo.label"),
      other: t("desktop.editor.formatBlockedOther.label"),
      vue: t("desktop.editor.formatBlockedVue.label"),
    }),
    [t],
  );

  // 右键菜单：套上主题；打开期间报“有浮层”，原生预览让位，菜单伸到预览上的部分才看得见（#566）
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const watch = watchContextMenu(container, setMenuOpen);
    return () => watch.dispose();
  }, []);
  useOverlay(menuOpen);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let disposed = false;
    let host: EditorHost | undefined;
    createHost(
      container,
      {
        onEdit: (path, text) => session.edit(path, text),
        onComposing: (path, composing) => session.setComposing(path, composing),
        onNormalized: (path, text) => session.adoptNormalized(path, text),
        onOpenFile: (path) => void session.openFile(path),
        onStrayEdit: (path, text) => void session.adoptEdit(path, text),
      },
      locale,
      bridgeProjectSource(bridge, tab.id),
      formatLabels,
    )
      .then((created) => {
        if (disposed) {
          created.dispose();
          return;
        }
        host = created;
        hostRef.current = created;
        setHostReady(true);
      })
      .catch((error: unknown) => {
        // 编辑器脚本没加载起来：文件标签和说明照常显示，只是没有代码区；不打扰用户
        console.error("editor host failed", error);
      });
    return () => {
      disposed = true;
      host?.dispose();
      hostRef.current = null;
      setHostReady(false);
    };
  }, [createHost, session, locale, bridge, tab.id, formatLabels]);

  useEffect(() => {
    if (hostReady) hostRef.current?.sync(state, theme);
  }, [hostReady, state, theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!visible) return;
      const pressed = modKey === "meta" ? event.metaKey : event.ctrlKey;
      if (!pressed || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "w") {
        if (!session.closeCurrent()) return;
        event.preventDefault();
        event.stopPropagation();
      } else if (key === "s") {
        event.preventDefault();
        event.stopPropagation();
        const path = session.getState().active;
        if (path !== null) void session.save(path);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [session, modKey, visible]);

  // 终端按 ⌃` 把焦点还给编辑器（DESKTOP-TERMINAL-05）：光标留在原来的位置
  useEffect(() => onEditorFocusRequest(() => visible && hostRef.current?.focus()), [visible]);

  // 失去焦点（DESKTOP-EDITOR-24）：焦点移出编辑器区域（点了预览、控制台或别处），或者切到别的应用、关窗口
  useEffect(() => {
    const root = rootRef.current;
    const onFocusOut = (event: FocusEvent) => {
      if (!root?.contains(event.relatedTarget as Node | null)) session.blur();
    };
    const onWindowBlur = () => session.blur();
    root?.addEventListener("focusout", onFocusOut);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      root?.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [session]);

  const editing = active?.view === "text";
  // 命令面板里的编辑器命令（规格“命令面板”）：只在有文件标签、编辑器画好了的时候登记，
  // 没有打开文件就没有这些命令（规格 DESKTOP-EDITOR-61）
  const operate = (operation: EditorOperation) =>
    editing && hostReady ? () => hostRef.current?.run(operation) : null;
  useCommands({
    "editor.save": editing && active !== null ? () => void session.save(active.path) : null,
    "editor.closeTab": active === null ? null : () => void session.requestClose(active.path),
    "editor.find": operate("find"),
    "editor.replace": operate("replace"),
    "editor.goToLine": operate("goToLine"),
    "editor.goToDefinition": operate("goToDefinition"),
    "editor.renameSymbol": operate("renameSymbol"),
    "editor.toggleComment": operate("toggleComment"),
    "editor.foldAll": operate("foldAll"),
    "editor.unfoldAll": operate("unfoldAll"),
    "editor.selectAllOccurrences": operate("selectAllOccurrences"),
    // 不能格式化的文件（Python、Go、Vue 服务没起来等）命令面板里不列（规格 DESKTOP-EDITOR-61 的“只列能用的”）
    "editor.formatDocument":
      active !== null && formatSupport(editorLanguageOf(active.path, active.mode), vueUsable).ok
        ? operate("formatDocument")
        : null,
  });
  let status: SaveStatusKind | null = null;
  if (editing && active !== null) status = statusOf(active);
  const name = active === null ? "" : baseName(active.path);
  const saveFailedMessage =
    active?.saveError === "read-only"
      ? t("desktop.editor.saveFailedReadOnly.body", { name })
      : active?.saveError === "permission"
        ? t("desktop.editor.saveFailedPermission.body", { name })
        : t("desktop.editor.saveFailedOther.body", { name });
  const conflict = editing && active?.conflict ? active : null;
  const promptTab = state.tabs.find((candidate) => candidate.path === state.closePrompt);
  return (
    <section ref={rootRef} className={styles.root} data-editor={tab.id}>
      <div className={styles.bar}>
        <FileTabs
          tabs={state.tabs}
          active={state.active}
          onSelect={(path) => session.select(path)}
          onClose={(path) => void session.requestClose(path)}
        />
        {status === null ? null : <SaveStatus kind={status} />}
      </div>
      {active === null ? null : <EditorBreadcrumb project={tab.name} path={active.path} />}
      {editing && active?.saveError ? (
        <EditorBar
          tone="danger"
          title={t("desktop.editor.saveFailed.title")}
          message={saveFailedMessage}
          action={{
            label: t("desktop.editor.saveFailedRetry.action"),
            onClick: () => void session.save(active.path),
          }}
        />
      ) : null}
      {conflict === null ? null : (
        <EditorBar
          tone="info"
          message={t("desktop.editor.diskChanged.body", { name })}
          action={{
            label: t("desktop.editor.useDisk.action"),
            onClick: () => void session.useDisk(conflict.path),
          }}
          secondary={{
            label: t("desktop.editor.keepMine.action"),
            onClick: () => void session.keepMine(conflict.path),
          }}
        />
      )}
      {editing && active?.deleted ? (
        <EditorBar
          tone="info"
          message={t("desktop.editor.deletedNotice.body", {
            name,
            keys: modKey === "meta" ? "⌘S" : "Ctrl+S",
          })}
        />
      ) : null}
      {editing && active?.mixedEol && active.eol !== "none" ? (
        <EditorBar
          tone="info"
          message={t("desktop.editor.mixedEolNotice.body", {
            eol: active.eol === "crlf" ? "CRLF" : "LF",
          })}
        />
      ) : null}
      {editing && active?.mode === "plain" ? (
        <EditorBar tone="info" message={t("desktop.editor.plainNotice.body")} />
      ) : null}
      {editing && active?.mode === "plain-large" ? (
        <EditorBar tone="info" message={t("desktop.editor.plainLargeNotice.body")} />
      ) : null}
      <div ref={containerRef} className={styles.code} hidden={!editing} data-code="" />
      {editing ? null : (
        <FileNotice
          tab={active}
          onReveal={(path) => void bridge.call("files.reveal", { project: tab.id, path })}
          onOpenExternal={(path) =>
            void bridge.call("files.openExternal", { project: tab.id, path })
          }
        />
      )}
      <ClosePrompt
        name={promptTab === undefined ? null : baseName(promptTab.path)}
        onAnswer={(answer) => void session.answerClose(answer)}
      />
    </section>
  );
}
