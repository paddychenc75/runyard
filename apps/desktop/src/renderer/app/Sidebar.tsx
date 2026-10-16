import { useFormat, useT } from "@runyard/i18n/react";
import { GlassSurface, NavList, type NavListSection, ScrollArea, TitleBar } from "@runyard/ui";
import { useState } from "react";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
  windowControls: BootstrapInfo["windowControls"];
  /** 资源库里项目的总数 */
  total: number;
}

// 侧栏：顶上给窗口按钮留位置，下面是品牌、资源库的筛选、管理的几个页面，底部是资源库的概况。
// 只有“全部”有内容可看；其余筛选项和页面随 #169、#170 等，现在列出但点不了（设计稿 Main）。
export function Sidebar({ windowControls, total }: SidebarProps) {
  const t = useT();
  const format = useFormat();
  const [section, setSection] = useState("all");
  const sections: NavListSection[] = [
    {
      id: "library",
      title: t("library.nav.library.title"),
      items: [
        { id: "all", label: t("library.filter.all.label"), count: format.number(total) },
        { id: "kept", label: t("library.filter.kept.label"), disabled: true },
        { id: "autoClean", label: t("library.filter.autoClean.label"), disabled: true },
        { id: "agent", label: t("library.filter.agent.label"), disabled: true },
      ],
    },
    {
      id: "manage",
      title: t("library.nav.manage.title"),
      items: [
        { id: "templates", label: t("library.nav.templates.label"), icon: "cube", disabled: true },
        { id: "unused", label: t("library.nav.unused.label"), icon: "clock", disabled: true },
        {
          id: "settings",
          label: t("library.nav.settings.label"),
          icon: "sliders",
          disabled: true,
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
          value={section}
          onValueChange={setSection}
        />
      </ScrollArea>
      <div className={styles.footer}>{t("library.sidebar.footer.label", { count: total })}</div>
    </GlassSurface>
  );
}
