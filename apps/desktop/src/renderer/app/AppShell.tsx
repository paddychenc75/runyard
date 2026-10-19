import { useT } from "@runyard/i18n/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import type { SettingsApi } from "../bridge/use-settings.ts";
import { EditorWorkspace } from "../features/editor/EditorWorkspace.tsx";
import { PaletteHost } from "../features/palette/PaletteHost.tsx";
import { forgetPanelMode } from "../features/terminal/panel-mode.ts";
import { defaultQuery, type LibraryQuery, navCounts } from "../library-query.ts";
import { runningCount } from "../library-view.ts";
import {
  CommandContext,
  CommandHost,
  useCommandHost,
  useCommands,
} from "../shared/command-host.tsx";
import { ContentVisibility } from "../shared/content-visibility.ts";
import { requestEditorFocus } from "../shared/editor-focus.ts";
import { useLayoutPrefs } from "../shared/layout-prefs.ts";
import { OverlayContext } from "../shared/overlay-context.tsx";
import { OverlayCounter } from "../shared/overlay-counter.ts";
import { sizeTotalOf } from "../size-view.ts";
import styles from "./AppShell.module.css";
import { CloseConfirmDialog } from "./CloseConfirmDialog.tsx";
import { CreateDialog } from "./CreateDialog.tsx";
import { LibraryPage } from "./LibraryPage.tsx";
import { NotificationSources } from "./notifications/NotificationSources.tsx";
import { NotificationContext } from "./notifications/notification-context.tsx";
import { createNotificationService } from "./notifications/notification-service.ts";
import { PaneToggleButton } from "./PaneToggleButton.tsx";
import { PickerDialog } from "./PickerDialog.tsx";
import { QuitTerminalPrompt } from "./QuitTerminalPrompt.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { SettingsPage } from "./settings/SettingsPage.tsx";
import { useAutoSaveReader } from "./settings/use-autosave-reader.ts";
import { chooseNavFilter, type ShellPage, showLibrary } from "./sidebar-navigation.ts";
import { TopBar } from "./TopBar.tsx";
import { TemplatesPage } from "./templates/TemplatesPage.tsx";
import { UrlConfirmDialog } from "./UrlConfirmDialog.tsx";
import { useQuitTerminalConfirm } from "./use-quit-terminal-confirm.ts";
import { useResponsiveSidebar } from "./use-responsive-sidebar.ts";
import { useSettingsPage } from "./use-settings-page.ts";
import { WorkspaceLayout } from "./WorkspaceLayout.tsx";

export interface AppShellProps {
  bridge: DesktopBridge;
  /** 第一次推送之前是 null */
  library: LibraryState | null;
  settings: SettingsApi;
}

// 主窗口的外壳（设计稿 Main）：悬浮的玻璃侧栏、顶部的标签条，右下是内容区。
// 资源库标签的内容区是资源库页（整宽的项目表）；项目标签上面是 TabContent 加右边的预览（原生视图）
// 或脚本输出，下面是控制台（脚本的输出就在右边，不再另开）。
export function AppShell(props: AppShellProps) {
  // 命令宿主在外壳最外面：下面各个部件（顶栏、运行条、编辑器……）显示期间登记自己的命令，命令面板读它
  const [commands] = useState(() => new CommandHost());
  const [notifications] = useState(createNotificationService);
  return (
    <NotificationContext.Provider value={notifications}>
      <CommandContext.Provider value={commands}>
        <ShellBody {...props} />
      </CommandContext.Provider>
    </NotificationContext.Provider>
  );
}

function ShellBody({ bridge, library, settings }: AppShellProps) {
  const t = useT();
  const [overlays] = useState(() => new OverlayCounter());
  const title = t("desktop.window.title");
  useEffect(() => {
    document.title = title;
  }, [title]);
  // 页面切换不改变项目持有者；设置暂时隐藏工作区而不卸载它。
  const [page, setPage] = useState<ShellPage>("library");
  const [temporaryNavigation, setTemporaryNavigation] = useState<boolean | null>(null);
  const activeTabId = library?.activeTab ?? "library";
  useEffect(() => {
    setPage((current) => (current === "settings" ? current : "library"));
    setTemporaryNavigation(null);
  }, [activeTabId]);
  // 编辑器按设置里的自动保存档位存（规格 DESKTOP-SETTINGS-11）
  const readAutoSave = useAutoSaveReader(settings.settings);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 选好模板后的新建弹窗（规格 DESKTOP-CREATE-FLOW-05）：值是模板标识，没有弹窗是 null
  const [creating, setCreating] = useState<string | null>(null);
  // 从“没有结果”画面来的新建：新建弹窗里名称预先填好（规格 DESKTOP-LIBRARY-VIEW-25）；其他入口是 null
  const [pendingName, setPendingName] = useState<string | null>(null);
  // 资源库页的搜索、侧栏筛选、下拉：在外壳里持有，顶栏的搜索框、侧栏和列表共用
  const [query, setQuery] = useState<LibraryQuery>(defaultQuery);
  const revealSequence = library?.libraryReveal?.sequence;
  useEffect(() => {
    if (revealSequence === undefined) return;
    setPage("library");
    setQuery(defaultQuery);
  }, [revealSequence]);
  const patchQuery = useCallback(
    (patch: Partial<LibraryQuery>) => setQuery((current) => ({ ...current, ...patch })),
    [],
  );
  const searchRef = useRef<HTMLInputElement>(null);
  // 空资源库的首次启动直接进选择器（PRD #prd-first-run）：只在第一次读到状态时判断一次，
  // 用户关掉之后不再自动弹出
  const firstLoadHandled = useRef(false);
  useEffect(() => {
    // 管理进程还没回话时的空列表不算“资源库是空的”：等第一次读完再判（#298）
    if (library === null || !library.loaded || firstLoadHandled.current) return;
    firstLoadHandled.current = true;
    if (library.playgrounds.length === 0 && library.error === null) setPickerOpen(true);
  }, [library]);
  // ⌘N 是主进程的菜单项（焦点在预览视图里时按键到不了这里），经事件通知
  const openPicker = useCallback(() => {
    setCreating(null);
    setPendingName(null);
    setPickerOpen(true);
  }, []);
  useEffect(() => bridge.on("picker.open", openPicker), [bridge, openPicker]);
  const openPickerNamed = useCallback((name: string) => {
    setCreating(null);
    setPendingName(name);
    setPickerOpen(true);
  }, []);
  // 新建弹窗里的“换一个模板”：回到选择器，已经预填的名称留着
  const changeTemplate = useCallback(() => {
    setCreating(null);
    setPickerOpen(true);
  }, []);
  const onPick = useCallback((templateId: string) => {
    setPickerOpen(false);
    setCreating(templateId);
  }, []);
  const { windowControls, modKey } = bridge.bootstrap;
  // 版面偏好：侧栏收起与否、各面板的尺寸（记在界面自己的存储里）
  const [layoutPrefs, patchLayout] = useLayoutPrefs();
  const onLibraryPage = (library?.activeTab ?? "library") === "library";
  // ⌘F 在资源库页把焦点放进搜索框（规格 DESKTOP-LIBRARY-VIEW-14）；项目标签页没有搜索框，不拦
  useEffect(() => {
    if (!onLibraryPage || page !== "library") return;
    function onKeyDown(event: KeyboardEvent) {
      const pressed = modKey === "meta" ? event.metaKey : event.ctrlKey;
      if (!pressed || event.key.toLowerCase() !== "f" || event.altKey || event.shiftKey) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onLibraryPage, modKey, page]);
  const tabs = library?.tabs ?? [];
  const activeTab = library?.activeTab ?? "library";
  const settingsPage = useSettingsPage(
    bridge,
    page,
    setPage,
    activeTab,
    tabs.map((tab) => tab.id),
    library?.projectSelection,
  );
  // 标签页关了，终端也结束了：再打开这个项目时底部面板从“输出”开始，不自动创建终端（DESKTOP-TERMINAL-06）
  const openIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(tabs.map((tab) => tab.id));
    for (const id of openIds.current) if (!now.has(id)) forgetPanelMode(id);
    openIds.current = now;
  });
  const { quitAsk, askQuit } = useQuitTerminalConfirm(bridge);
  // 侧栏只在资源库标签上显示（设计稿 WebLight、Script 的项目标签页没有它），并且可以收起
  const sidebar = useResponsiveSidebar(
    onLibraryPage && page !== "templates",
    temporaryNavigation === null ? layoutPrefs.sidebarCollapsed : !temporaryNavigation,
    () => {
      if (temporaryNavigation !== null) {
        setTemporaryNavigation(!temporaryNavigation);
      } else patchLayout({ sidebarCollapsed: !layoutPrefs.sidebarCollapsed });
    },
  );
  const sidebarVisible = onLibraryPage && sidebar.visible;
  const openSettings = () => {
    if (page === "settings") return;
    sidebar.close();
    settingsPage.open();
  };
  // ⌃⌘S 是主进程的菜单项（原因同 ⌘N）：资源库标签上收起或显示侧栏，项目标签页上收起或展开文件树
  // （那里的“侧栏”，规格 DESKTOP-WORKSPACE-62）
  const toggleSidebar = useCallback(() => {
    if (onLibraryPage) sidebar.toggle();
    else if (page !== "settings") patchLayout({ treeCollapsed: !layoutPrefs.treeCollapsed });
  }, [onLibraryPage, page, sidebar.toggle, layoutPrefs.treeCollapsed, patchLayout]);
  useEffect(() => bridge.on("sidebar.toggle", toggleSidebar), [bridge, toggleSidebar]);
  // 应用菜单触发的命令（设置、项目操作……）和命令面板走同一个宿主：此刻没登记的命令不会做任何事
  const commandHost = useCommandHost();
  useEffect(
    () => bridge.on("command.run", ({ id }) => void commandHost.run(id)),
    [bridge, commandHost],
  );
  const selectTab = useCallback(
    (id: string) => {
      setPage("library");
      void bridge.call("tab.select", id);
      if (page === "settings" && id !== "library") requestAnimationFrame(requestEditorFocus);
    },
    [bridge, page],
  );
  // 命令面板里的应用命令（规格“命令面板”）：和菜单、按钮里的同名项走同一个动作；
  // 当前页面上没有意义的不登记（已经在资源库页就没有“打开资源库”，资源库页没有“收起或展开文件树”）
  useCommands({
    "app.new": openPicker,
    "app.openLibrary":
      onLibraryPage && page === "library"
        ? null
        : () => {
            showLibrary({ activeTab, selectTab });
            setPage("library");
          },
    "app.settings": openSettings,
    // ⌘W：项目标签页里先关当前的文件标签，没有文件标签再关项目标签页（规格 DESKTOP-EDITOR-17）
    "app.closeTab":
      page === "settings"
        ? settingsPage.close
        : activeTab === "library"
          ? null
          : () => {
              if (!commandHost.run("editor.closeTab")) void bridge.call("tab.close", activeTab);
            },
    "app.stopAll": () => void bridge.call("run.stopAll"),
    "app.toggleSidebar": toggleSidebar,
    "app.toggleTree":
      onLibraryPage || page === "settings"
        ? null
        : () => patchLayout({ treeCollapsed: !layoutPrefs.treeCollapsed }),
    "app.themeLight": () => settings.update({ theme: "light" }),
    "app.themeDark": () => settings.update({ theme: "dark" }),
    "app.themeSystem": () => settings.update({ theme: "system" }),
  });
  const activeTabRow = tabs.find((tab) => tab.id === activeTab);
  const total = library?.playgrounds.length ?? 0;
  return (
    <OverlayContext.Provider value={overlays}>
      <EditorWorkspace
        bridge={bridge}
        tabs={tabs}
        activeTab={activeTab}
        autosave={readAutoSave}
        beforeQuit={askQuit}
      >
        <div
          ref={sidebar.root}
          className={styles.root}
          data-sidebar-overlay={sidebar.overlay ? "" : undefined}
          data-sidebar={sidebarVisible && !sidebar.overlay ? "shown" : "hidden"}
          data-controls={windowControls.inset === 0 ? "none" : windowControls.side}
        >
          {sidebarVisible ? (
            <Sidebar
              windowControls={windowControls}
              total={total}
              sizeTotal={sizeTotalOf(library?.playgrounds ?? [])}
              counts={navCounts(library?.playgrounds ?? [])}
              nav={query.nav}
              onNavChange={(nav) => {
                chooseNavFilter(nav, { activeTab, patchQuery, selectTab });
                sidebar.close();
              }}
              templateCount={library?.templateCount ?? library?.templates.length ?? 0}
              libraryRoot={library?.libraryRoot ?? ""}
              page={page}
              onCollapse={toggleSidebar}
              onSettings={openSettings}
              onNavigate={(next) => {
                showLibrary({ activeTab, selectTab });
                // 模板页没有顶栏：从覆盖导航进入时保留现有侧栏，回库再收回，不写手动偏好。
                setTemporaryNavigation(
                  next === "templates" && (sidebar.overlay || temporaryNavigation !== null)
                    ? true
                    : null,
                );
                setPage(next);
                sidebar.close(next === "library" && temporaryNavigation !== null);
              }}
            />
          ) : null}
          {page !== "templates" ? (
            <TopBar
              bridge={bridge}
              modKey={modKey}
              tabs={tabs}
              activeTab={activeTab}
              running={runningCount(library?.playgrounds ?? [])}
              runs={library?.runs ?? []}
              playgrounds={library?.playgrounds ?? []}
              activeTabRow={activeTabRow}
              sidebarVisible={sidebarVisible}
              onToggleSidebar={onLibraryPage ? toggleSidebar : undefined}
              onNew={openPicker}
              onSelect={selectTab}
              onClose={(id) => void bridge.call("tab.close", id)}
            />
          ) : null}
          {page === "templates" && !sidebarVisible ? (
            <div className={styles.standaloneToggle}>
              <PaneToggleButton
                sidebar
                label={t("library.sidebar.expand.label")}
                expanded={false}
                onClick={toggleSidebar}
              />
            </div>
          ) : null}
          {page === "templates" ? (
            <main className={styles.settings}>
              <TemplatesPage
                bridge={bridge}
                locale={library?.locale ?? bridge.bootstrap.locale}
                onCreate={onPick}
              />
            </main>
          ) : (
            <ContentVisibility.Provider value={page === "library"}>
              <main
                className={styles.content}
                hidden={page === "settings"}
                inert={page === "settings"}
              >
                {activeTabRow === undefined ? (
                  <LibraryPage
                    bridge={bridge}
                    library={library}
                    query={query}
                    searchRef={searchRef}
                    onQueryChange={patchQuery}
                    onNew={openPicker}
                    onCreateFrom={onPick}
                    onNewNamed={openPickerNamed}
                  />
                ) : (
                  <WorkspaceLayout
                    bridge={bridge}
                    tab={activeTabRow}
                    overlays={overlays}
                    prefs={layoutPrefs}
                    onPrefs={patchLayout}
                  />
                )}
              </main>
            </ContentVisibility.Provider>
          )}
          {page === "settings" ? (
            <main className={styles.content}>
              <SettingsPage bridge={bridge} api={settings} library={library} />
            </main>
          ) : null}
          <CloseConfirmDialog bridge={bridge} request={library?.closeRequest ?? null} />
          <PaletteHost
            bridge={bridge}
            project={onLibraryPage || page === "settings" ? null : activeTab}
          />
          <QuitTerminalPrompt
            busy={quitAsk?.busy ?? null}
            nameOf={(project) => tabs.find((tab) => tab.id === project)?.name ?? project}
            onAnswer={(quit) => quitAsk?.answer(quit)}
          />
          {library === null ? null : (
            <UrlConfirmDialog
              bridge={bridge}
              request={library.linkConfirm}
              locale={library.locale}
            />
          )}
          <NotificationSources bridge={bridge} library={library} />
          {creating !== null && library !== null ? (
            <CreateDialog
              key={creating}
              bridge={bridge}
              library={library}
              templateId={creating}
              initialName={pendingName ?? undefined}
              onClose={() => {
                setCreating(null);
                setPendingName(null);
              }}
              onChangeTemplate={changeTemplate}
            />
          ) : null}
          {pickerOpen && library !== null ? (
            <PickerDialog
              library={library}
              onPick={onPick}
              onClose={() => {
                setPickerOpen(false);
                setPendingName(null);
              }}
            />
          ) : null}
        </div>
      </EditorWorkspace>
    </OverlayContext.Provider>
  );
}
