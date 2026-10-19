import { useFormat, useT } from "@runyard/i18n/react";
import {
  GlassSurface,
  NavList,
  type NavListSection,
  ScrollArea,
  TitleBar,
  UserText,
} from "@runyard/ui";
import brandLight from "../../../../../docs/design/logo/final/icon-32.svg";
import brandDark from "../../../../../docs/design/logo/final/icon-32-dark.svg";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";
import { type NavFilter, navFilters } from "../library-query.ts";
import { useWindowFocused } from "../shared/use-window-focused.ts";
import { navLabel } from "./library-labels.ts";
import { PaneToggleButton } from "./PaneToggleButton.tsx";
import styles from "./Sidebar.module.css";
import type { ShellPage } from "./sidebar-navigation.ts";

export interface SidebarProps {
  windowControls: BootstrapInfo["windowControls"];
  /** 资源库里项目的总数 */
  total: number;
  /** 所有项目大小的合计，和有没有项目还在计算（规格 DESKTOP-LIBRARY-VIEW-69、70） */
  sizeTotal: { bytes: number; calculating: boolean };
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
  onSettings?: () => void;
  /** 收起侧栏（顶部、红绿灯那一行的右端；规格 DESKTOP-LIBRARY-VIEW-61、66） */
  onCollapse: () => void;
}

// 侧栏：顶上给窗口按钮留位置，下面是品牌、资源库的筛选、管理的几个页面，底部是资源库的概况。
// 资源库的四个固定筛选可点，右边是符合的项目数（#181）；管理里“设置”（#188）和“模板”（#291）可点，“长期未使用”第一版不显示（设计稿 Main）。
export function Sidebar({
  windowControls,
  total,
  sizeTotal,
  counts,
  nav,
  onNavChange,
  templateCount,
  libraryRoot,
  page,
  onNavigate,
  onSettings,
  onCollapse,
}: SidebarProps) {
  const t = useT();
  const focused = useWindowFocused();
  const format = useFormat();
  const sections: NavListSection[] = [
    {
      id: "library",
      title: t("library.nav.library.title"),
      items: navFilters
        .filter((id) => id !== "autoClean")
        .map((id) => ({
          id,
          label: navLabel(id, t),
          count: format.number(counts[id]),
        })),
    },
    {
      id: "clean",
      title: t("library.nav.clean.title"),
      items: [
        {
          id: "autoClean",
          label: navLabel("autoClean", t),
          count: format.number(counts.autoClean),
        },
      ],
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
  // 没有项目只写个数；有项目还在计算时写“正在计算大小”，全算完才写合计
  const footerText = () => {
    if (total === 0) return t("library.sidebar.footer.label", { count: total });
    if (sizeTotal.calculating) return t("library.sidebar.calculating.label", { count: total });
    return t("library.sidebar.total.label", {
      count: total,
      size: format.fileSize(sizeTotal.bytes),
    });
  };
  return (
    <GlassSurface
      material="sidebar"
      className={styles.root}
      data-library-sidebar=""
      data-sidebar-controls={controls}
    >
      <TitleBar controls={controls}>
        <span className={styles.toggle}>
          <PaneToggleButton
            label={t("library.sidebar.collapse.label")}
            expanded
            sidebar
            onClick={onCollapse}
          />
        </span>
      </TitleBar>
      <div className={styles.brand} data-sidebar-brand="">
        <span className={styles.mark} aria-hidden="true">
          <img
            className={styles.lightMark}
            src={brandLight}
            alt={t("desktop.window.title")}
            aria-hidden="true"
            draggable={false}
          />
          <img
            className={styles.darkMark}
            src={brandDark}
            alt={t("desktop.window.title")}
            aria-hidden="true"
            draggable={false}
          />
        </span>
        <span>{t("desktop.window.title")}</span>
      </div>
      <ScrollArea className={styles.nav}>
        <NavList
          label={t("library.nav.aria")}
          sections={sections}
          active={focused}
          value={page === "library" ? nav : page}
          onValueChange={(id) => {
            if (id === "settings") {
              onSettings?.();
              return;
            }
            if (id === "templates") {
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
        <div>{footerText()}</div>
      </div>
    </GlassSurface>
  );
}
