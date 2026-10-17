import { useFormat, useT } from "@runyard/i18n/react";
import {
  GlassSurface,
  NavList,
  type NavListSection,
  ScrollArea,
  TitleBar,
  UserText,
} from "@runyard/ui";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";
import { type NavFilter, navFilters } from "../library-query.ts";
import { navLabel } from "./library-labels.ts";
import { PaneToggleButton } from "./PaneToggleButton.tsx";
import styles from "./Sidebar.module.css";
import type { ShellPage } from "./sidebar-navigation.ts";

export interface SidebarProps {
  windowControls: BootstrapInfo["windowControls"];
  /** 资源库里项目的总数 */
  total: number;
  /** 四个固定筛选各自符合的项目数 */
  counts: Record<NavFilter, number>;
  /** 当前的固定筛选 */
  nav: NavFilter;
  onNavChange: (nav: NavFilter) => void;
  /** 模板总数（“管理”组的“模板”右边） */
  templateCount: number;
  /** 资源库文件夹，主目录缩成 ~；还没读到是空串 */
  libraryRoot: string;
  /** 当前显示的页：资源库、模板或设置（规格 DESKTOP-SETTINGS-01、DESKTOP-TEMPLATES-VIEW-01） */
  page: ShellPage;
  onNavigate: (page: ShellPage) => void;
  /** 收起侧栏（顶部、红绿灯那一行的右端；规格 DESKTOP-LIBRARY-VIEW-61、66） */
  onCollapse: () => void;
}

// 侧栏：顶上给窗口按钮留位置，下面是品牌、资源库的筛选、管理的几个页面，底部是资源库的概况。
// 资源库的四个固定筛选可点，右边是符合的项目数（#181）；管理里“设置”（#188）和“模板”（#291）可点，“长期未使用”随后续 issue，现在列出但点不了（设计稿 Main）。
export function Sidebar({
  windowControls,
  total,
  counts,
  nav,
  onNavChange,
  templateCount,
  libraryRoot,
  page,
  onNavigate,
  onCollapse,
}: SidebarProps) {
  const t = useT();
  const format = useFormat();
  const sections: NavListSection[] = [
    {
      id: "library",
      title: t("library.nav.library.title"),
      items: navFilters.map((id) => ({
        id,
        label: navLabel(id, t),
        count: format.number(counts[id]),
      })),
    },
    {
      id: "manage",
      title: t("library.nav.manage.title"),
      items: [
        {
          id: "templates",
          label: t("library.nav.templates.label"),
          icon: "cube",
          count: format.number(templateCount),
        },
        { id: "unused", label: t("library.nav.unused.label"), icon: "clock", disabled: true },
        {
          id: "settings",
          label: t("library.nav.settings.label"),
          icon: "sliders",
        },
      ],
    },
  ];
  // 窗口按钮是自绘标题栏的一部分：让位宽度大于 0 才有，在哪一侧由主进程说了算
  const controls =
    windowControls.inset === 0 ? "none" : windowControls.side === "left" ? "start" : "end";
  return (
    <GlassSurface material="sidebar" className={styles.root}>
      <TitleBar controls={controls}>
        <span className={styles.toggle}>
          <PaneToggleButton
            label={t("library.sidebar.collapse.label")}
            expanded
            onClick={onCollapse}
          />
        </span>
      </TitleBar>
      <div className={styles.brand}>{t("desktop.window.title")}</div>
      <ScrollArea className={styles.nav}>
        <NavList
          label={t("library.nav.aria")}
          sections={sections}
          value={page === "library" ? nav : page}
          onValueChange={(id) => {
            if (id === "settings" || id === "templates") {
              onNavigate(id);
              return;
            }
            onNavChange(id as NavFilter);
            onNavigate("library");
          }}
        />
      </ScrollArea>
      <div className={styles.footer}>
        <UserText mono className={styles.location}>
          {libraryRoot}
        </UserText>
        <div>{t("library.sidebar.footer.label", { count: total })}</div>
      </div>
    </GlassSurface>
  );
}
