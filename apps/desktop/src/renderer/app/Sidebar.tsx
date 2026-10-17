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
import styles from "./Sidebar.module.css";

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
  /** 当前显示的页：资源库或设置（规格 DESKTOP-SETTINGS-01） */
  page: "library" | "settings";
  onNavigate: (page: "library" | "settings") => void;
}

// 侧栏：顶上给窗口按钮留位置，下面是品牌、资源库的筛选、管理的几个页面，底部是资源库的概况。
// 资源库的四个固定筛选可点，右边是符合的项目数（#181）；管理里“设置”可点（#188），其余页面随 #169、#170 等，现在列出但点不了（设计稿 Main）。
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
          disabled: true,
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
      <TitleBar controls={controls} />
      <div className={styles.brand}>{t("desktop.window.title")}</div>
      <ScrollArea className={styles.nav}>
        <NavList
          label={t("library.nav.aria")}
          sections={sections}
          value={page === "settings" ? "settings" : nav}
          onValueChange={(id) => {
            if (id === "settings") {
              onNavigate("settings");
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
