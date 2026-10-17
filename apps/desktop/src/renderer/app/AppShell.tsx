import { useT } from "@runyard/i18n/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import type { SettingsApi } from "../bridge/use-settings.ts";
import { EditorWorkspace } from "../features/editor/EditorWorkspace.tsx";
import { PaletteHost } from "../features/palette/PaletteHost.tsx";
import { defaultQuery, type LibraryQuery, navCounts } from "../library-query.ts";
import { runningCount } from "../library-view.ts";
import { CommandContext, CommandHost, useCommands } from "../shared/command-host.tsx";
import { useLayoutPrefs } from "../shared/layout-prefs.ts";
import { OverlayContext } from "../shared/overlay-context.tsx";
import { OverlayCounter } from "../shared/overlay-counter.ts";
import styles from "./AppShell.module.css";
import { CloseConfirmDialog } from "./CloseConfirmDialog.tsx";
import { CreateDialog } from "./CreateDialog.tsx";
import { LibraryPage } from "./LibraryPage.tsx";
import { NoticeToasts } from "./NoticeToasts.tsx";
import { PickerDialog } from "./PickerDialog.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { SettingsPage } from "./settings/SettingsPage.tsx";
import { useAutoSaveReader } from "./settings/use-autosave-reader.ts";
import { chooseNavFilter, showLibrary } from "./sidebar-navigation.ts";
import { TopBar } from "./TopBar.tsx";
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
  return (
    <CommandContext.Provider value={commands}>
      <ShellBody {...props} />
    </CommandContext.Provider>
  );
}

function ShellBody({ bridge, library, settings }: AppShellProps) {
  const t = useT();
  const [overlays] = useState(() => new OverlayCounter());
  const title = t("desktop.window.title");
  useEffect(() => {
    document.title = title;
  }, [title]);
  // 设置是主窗口里的一页（规格 DESKTOP-SETTINGS-01）：侧栏点“设置”进，点“全部”或打开别的标签回到资源库
  const [page, setPage] = useState<"library" | "settings">("library");
  const activeTabId = library?.activeTab ?? "library";
  // 命令面板在项目标签页上执行“设置”：先切回资源库标签，标签变了之后落到设置页而不是资源库页
  const pageAfterSwitch = useRef<"settings" | null>(null);
  useEffect(() => {
    setPage(pageAfterSwitch.current ?? "library");
    pageAfterSwitch.current = null;
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
    if (!onLibraryPage) return;
    function onKeyDown(event: KeyboardEvent) {
      const pressed = modKey === "meta" ? event.metaKey : event.ctrlKey;
      if (!pressed || event.key.toLowerCase() !== "f" || event.altKey || event.shiftKey) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onLibraryPage, modKey]);
  const tabs = library?.tabs ?? [];
  const activeTab = library?.activeTab ?? "library";
  // 侧栏只在资源库标签上显示（设计稿 WebLight、Script 的项目标签页没有它），并且可以收起
  const sidebarVisible = onLibraryPage && !layoutPrefs.sidebarCollapsed;
  // ⌃⌘S 是主进程的菜单项（原因同 ⌘N）：资源库标签上收起或显示侧栏，项目标签页上收起或展开文件树
  // （那里的“侧栏”，规格 DESKTOP-WORKSPACE-62）
  const toggleSidebar = useCallback(() => {
    if (onLibraryPage) patchLayout({ sidebarCollapsed: !layoutPrefs.sidebarCollapsed });
    else patchLayout({ treeCollapsed: !layoutPrefs.treeCollapsed });
  }, [onLibraryPage, layoutPrefs.sidebarCollapsed, layoutPrefs.treeCollapsed, patchLayout]);
  useEffect(() => bridge.on("sidebar.toggle", toggleSidebar), [bridge, toggleSidebar]);
  const selectTab = useCallback((id: string) => void bridge.call("tab.select", id), [bridge]);
  // 命令面板里的应用命令（规格“命令面板”）：和菜单、按钮里的同名项走同一个动作；
  // 当前页面上没有意义的不登记（已经在资源库页就没有“打开资源库”，资源库页没有“收起或展开文件树”）
  const onSettings = page === "settings";
  useCommands({
    "app.new": openPicker,
    "app.openLibrary":
      onLibraryPage && !onSettings
        ? null
        : () => {
            showLibrary({ activeTab, selectTab });
            setPage("library");
          },
    "app.settings": onSettings
      ? null
      : () => {
          if (activeTab !== "library") pageAfterSwitch.current = "settings";
          showLibrary({ activeTab, selectTab });
          setPage("settings");
        },
    "app.stopAll": () => void bridge.call("run.stopAll"),
    "app.toggleSidebar": toggleSidebar,
    "app.toggleTree": onLibraryPage
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
      <EditorWorkspace bridge={bridge} tabs={tabs} activeTab={activeTab} autosave={readAutoSave}>
        <div
          className={styles.root}
          data-sidebar={sidebarVisible ? "shown" : "hidden"}
          data-controls={windowControls.inset === 0 ? "none" : windowControls.side}
        >
          {sidebarVisible ? (
            <Sidebar
              windowControls={windowControls}
              total={total}
              counts={navCounts(library?.playgrounds ?? [])}
              nav={query.nav}
              onNavChange={(nav) => chooseNavFilter(nav, { activeTab, patchQuery, selectTab })}
              templateCount={library?.templates.length ?? 0}
              libraryRoot={library?.libraryRoot ?? ""}
              page={page}
              onNavigate={(next) => {
                showLibrary({ activeTab, selectTab });
                setPage(next);
              }}
            />
          ) : null}
          {page === "settings" ? null : (
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
              search={query.search}
              onSearchChange={(search) => patchQuery({ search })}
              searchRef={searchRef}
              onSelect={selectTab}
              onClose={(id) => void bridge.call("tab.close", id)}
            />
          )}
          {page === "settings" ? (
            <main className={styles.settings}>
              <SettingsPage bridge={bridge} api={settings} library={library} />
            </main>
          ) : (
            <main className={styles.content}>
              {activeTabRow === undefined ? (
                <LibraryPage
                  bridge={bridge}
                  library={library}
                  query={query}
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
          )}
          <CloseConfirmDialog bridge={bridge} request={library?.closeRequest ?? null} />
          <PaletteHost bridge={bridge} project={onLibraryPage ? null : activeTab} />
          <NoticeToasts bridge={bridge} notices={library?.notices ?? []} />
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
