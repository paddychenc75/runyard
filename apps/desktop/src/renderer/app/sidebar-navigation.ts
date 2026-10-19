import type { LibraryQuery, NavFilter } from "../library-query.ts";

/** 主窗口资源库标签里能显示的页面（模板页没有顶栏；设置另开窗口） */
export type ShellPage = "library" | "templates";

// 点侧栏的一项（规格 DESKTOP-LIBRARY-VIEW-64）：筛选生效，并且一定回到资源库标签显示结果；
// 在项目标签页里点了却停在项目页，看起来就像没反应。
export interface SidebarNavigation {
  activeTab: string;
  patchQuery: (patch: Partial<LibraryQuery>) => void;
  selectTab: (id: string) => void;
}

export function chooseNavFilter(nav: NavFilter, context: SidebarNavigation): void {
  context.patchQuery({ nav });
  showLibrary(context);
}

/** 模板等页面的侧栏项也走这里：先回到资源库标签，页面本身由各页面的实现接上 */
export function showLibrary(context: Pick<SidebarNavigation, "activeTab" | "selectTab">): void {
  if (context.activeTab !== "library") context.selectTab("library");
}
