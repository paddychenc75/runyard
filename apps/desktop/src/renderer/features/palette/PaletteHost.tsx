import { createTranslator, desktopCatalogs, type Locale } from "@runyard/i18n";
import { useLocale, useT } from "@runyard/i18n/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CommandGroup,
  type CommandId,
  type CommandSpec,
  commandRegistry,
  shortcutLabel,
} from "../../../shared/commands.ts";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { useAvailableCommands, useCommandHost } from "../../shared/command-host.tsx";
import { useWorkspaceFiles } from "../../shared/workspace-files.tsx";
import { commandTitles } from "./command-titles.ts";
import { FileGlyph } from "./FileGlyph.tsx";
import styles from "./Palette.module.css";
import { Highlighted, Palette, type PaletteEntry } from "./Palette.tsx";
import { commandRows, fileRows } from "./palette-model.ts";
import { readRecentCommands, rememberCommand } from "./recent-commands.ts";
import { useProjectFiles } from "./use-project-files.ts";

export interface PaletteHostProps {
  bridge: DesktopBridge;
  /** 当前项目标签页的项目 id；在资源库页是 null（快速打开不可用，规格 DESKTOP-EDITOR-73） */
  project: string | null;
}

type OpenState = { mode: "commands" | "files"; query: string; project: string | null };

const OTHER_LOCALE: Record<Locale, Locale> = { en: "zh-CN", "zh-CN": "en" };

// 命令面板和快速打开的持有者（规格 DESKTOP-EDITOR-57 至 74）：管开合、焦点的去与回、⌘⇧P / F1 / ⌘P，
// 把“现在能用的命令”（各部件用 useCommand 登记）和“项目里的文件”排成行交给 Palette 画。
// ⌘⇧P、F1、⌘P 有两条路：焦点在界面里时窗口层面的按键监听（捕获阶段，抢在编辑器前面，
// 所以编辑器自带的命令面板出不来，规格 DESKTOP-EDITOR-63）；焦点在预览或终端里时主进程的菜单项发 palette.open
// （规格 DESKTOP-EDITOR-65）。两条路都只“打开”不“切换”，同时到了也不会开了又关。
export function PaletteHost({ bridge, project }: PaletteHostProps) {
  const t = useT();
  const locale = useLocale();
  const { modKey, platform } = bridge.bootstrap;
  const host = useCommandHost();
  const available = useAvailableCommands();
  const workspace = useWorkspaceFiles();
  const projectFiles = useProjectFiles(bridge, project);
  const [openState, setState] = useState<OpenState | null>(null);
  // 项目换了或回到资源库页，开着的面板就算关了（快速打开的文件属于上一个项目）
  const state = openState !== null && openState.project === project ? openState : null;
  const [recentCommands, setRecentCommands] = useState(() => readRecentCommands());
  const previousFocus = useRef<Element | null>(null);

  const open = useCallback(
    (mode: "commands" | "files") => {
      if (mode === "files" && project === null) return;
      setState((current) => {
        if (current === null || current.project !== project) {
          previousFocus.current = document.activeElement;
        }
        return current !== null && current.mode === mode && current.project === project
          ? current
          : { mode, query: "", project };
      });
    },
    [project],
  );
  const close = useCallback((restoreFocus: boolean) => {
    setState(null);
    const target = previousFocus.current;
    previousFocus.current = null;
    if (restoreFocus && target instanceof HTMLElement && target.isConnected) target.focus();
  }, []);

  // 窗口层面的按键：捕获阶段，抢在编辑器之前
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = modKey === "meta" ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();
      let mode: "commands" | "files" | null = null;
      if (event.key === "F1" && !mod && !event.shiftKey && !event.altKey) mode = "commands";
      else if (mod && !event.altKey && key === "p") mode = event.shiftKey ? "commands" : "files";
      if (mode === null) return;
      event.preventDefault();
      event.stopPropagation();
      open(mode);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [modKey, open]);
  useEffect(() => bridge.on("palette.open", ({ mode }) => open(mode)), [bridge, open]);

  // 最近打开的文件：按项目各记一份，最近的在前；第一次见到这个项目时用已打开的文件标签打底
  const [recentFiles, setRecentFiles] = useState<Record<string, readonly string[]>>({});
  const activePath = workspace.activePath;
  const openPaths = workspace.openPaths;
  useEffect(() => {
    if (project === null) return;
    setRecentFiles((all) => {
      const list = all[project] ?? [...openPaths].reverse();
      if (activePath === null)
        return all[project] === undefined ? { ...all, [project]: list } : all;
      return { ...all, [project]: [activePath, ...list.filter((path) => path !== activePath)] };
    });
  }, [project, activePath, openPaths]);

  const titles = useMemo(() => commandTitles(t), [t]);
  const aliases = useMemo(
    () =>
      commandTitles(
        createTranslator({
          locale: OTHER_LOCALE[locale],
          platform: platform === "darwin" ? "darwin" : "linux",
          catalogs: desktopCatalogs,
        }).t,
      ),
    [locale, platform],
  );
  const entries = useMemo<PaletteEntry[]>(() => {
    if (state === null) return [];
    if (state.mode === "commands") {
      const rows = commandRows({
        available,
        query: state.query,
        titles,
        aliases,
        recent: recentCommands,
      });
      const groupLabels: Record<CommandGroup | "recent", string> = {
        recent: t("desktop.palette.groupRecentCommands.label"),
        app: t("desktop.palette.groupApp.label"),
        project: t("desktop.palette.groupProject.label"),
        editor: t("desktop.palette.groupEditor.label"),
      };
      const out: PaletteEntry[] = [];
      let group: string | null = null;
      for (const row of rows) {
        if (state.query.trim() === "" && row.group !== group) {
          group = row.group;
          out.push({ type: "heading", key: `heading:${row.group}`, label: groupLabels[row.group] });
        }
        const spec: CommandSpec = commandRegistry[row.id];
        out.push({
          type: "option",
          key: row.id,
          label: <Highlighted text={row.title} hits={row.titleHits} />,
          secondary:
            row.alias === null ? undefined : (
              <Highlighted text={row.alias.text} hits={row.alias.hits} />
            ),
          shortcut:
            spec.accelerator === undefined ? undefined : shortcutLabel(spec.accelerator, modKey),
        });
      }
      return out;
    }
    const known = new Set(projectFiles);
    const remembered = (project === null ? undefined : recentFiles[project]) ?? [];
    const rows = fileRows({
      files: projectFiles,
      query: state.query,
      // 清单读出来之后，改名或删掉的文件不再出现在“最近打开”里
      recent: known.size === 0 ? remembered : remembered.filter((path) => known.has(path)),
      current: activePath,
    });
    const out: PaletteEntry[] = [];
    if (state.query.trim() === "" && rows.length > 0) {
      out.push({
        type: "heading",
        key: "heading:recent",
        label: t("desktop.palette.groupRecentFiles.label"),
      });
    }
    for (const row of rows) {
      out.push({
        type: "option",
        key: row.path,
        glyph: <FileGlyph name={row.name} className={styles.glyph} />,
        label: <Highlighted text={row.name} hits={row.nameHits} />,
        secondary: row.dir === "" ? undefined : <Highlighted text={row.dir} hits={row.dirHits} />,
      });
    }
    return out;
  }, [
    state,
    available,
    titles,
    aliases,
    recentCommands,
    projectFiles,
    project,
    recentFiles,
    activePath,
    modKey,
    t,
  ]);

  if (state === null) return null;

  function choose(key: string) {
    if (state === null) return;
    const mode = state.mode;
    close(true);
    // 等面板和它的遮罩撤掉、焦点回到原处之后再做，命令里弹出的对话框和编辑器的焦点才不会被抢走
    setTimeout(() => {
      if (mode === "commands") {
        setRecentCommands((current) => rememberCommand(key as CommandId, current));
        host.run(key as CommandId);
      } else {
        workspace.openFile(key);
      }
    }, 0);
  }

  return (
    <Palette
      mode={state.mode}
      query={state.query}
      onQueryChange={(value) =>
        setState((current) => {
          if (current === null) return current;
          // 快速打开里输入开头的 > 就变成命令面板（规格 DESKTOP-EDITOR-67）
          if (current.mode === "files" && value.startsWith(">")) {
            return { mode: "commands", query: value.slice(1), project };
          }
          return { ...current, query: value };
        })
      }
      onLeavePrefix={() => {
        // 资源库页没有快速打开：删掉 > 后面板还是命令面板
        if (project !== null) setState({ mode: "files", query: "", project });
      }}
      entries={entries}
      onChoose={choose}
      onClose={() => close(true)}
      emptyLabel={
        state.mode === "commands"
          ? t("desktop.palette.commandsEmpty.label")
          : t("desktop.palette.filesEmpty.label")
      }
    />
  );
}
