import type { useT } from "@runyard/i18n/react";
import type {
  NavFilter,
  SortDirection,
  SortKey,
  StatusFilter,
  TypeFilter,
} from "../library-query.ts";

type Translate = ReturnType<typeof useT>;

// 键写成完整的字面量（i18n-unused 靠它找用到的键），所以每个值一个分支
export function navLabel(nav: NavFilter, t: Translate) {
  switch (nav) {
    case "all":
      return t("library.filter.all.label");
    case "running":
      return t("library.status.running.label");
    case "autoClean":
      return t("library.filter.autoClean.label");
    case "agent":
      return t("library.filter.agent.label");
  }
}

export function typeLabel(type: TypeFilter, t: Translate) {
  switch (type) {
    case "all":
      return t("library.filter.all.label");
    case "page":
      return t("desktop.category.page.label");
    case "frontend":
      return t("desktop.category.frontend.label");
    case "fullstack":
      return t("desktop.category.fullstack.label");
    case "script":
      return t("desktop.category.script.label");
    case "service":
      return t("desktop.category.service.label");
  }
}

export function statusLabel(status: StatusFilter, t: Translate) {
  switch (status) {
    case "all":
      return t("library.filter.all.label");
    case "running":
      return t("library.status.running.label");
    case "stopped":
      return t("library.status.stopped.label");
    case "problem":
      return t("library.status.problem.label");
  }
}

export function sortLabel(sort: SortKey, t: Translate) {
  switch (sort) {
    case "recent":
      return t("library.sort.recent.label");
    case "name":
      return t("library.sort.name.label");
    case "created":
      return t("library.sort.created.label");
    case "size":
      return t("library.sort.size.label");
  }
}

/** 排序名加方向箭头（“最近使用 ↓”）：下拉按钮和下拉里选中的那一项用 */
export function sortValueLabel(sort: SortKey, direction: SortDirection, t: Translate) {
  const label = sortLabel(sort, t);
  return direction === "ascending"
    ? t("library.sort.ascending.label", { label })
    : t("library.sort.descending.label", { label });
}

/** 可点表头的悬停提示：不是当前排序列写“按 X 排序”，是当前列写点一下会变成哪个方向 */
export function sortHint(
  sort: SortKey,
  current: { sort: SortKey; direction: SortDirection },
  t: Translate,
) {
  const column = sortLabel(sort, t);
  if (current.sort !== sort) return t("library.column.sort.hint", { column });
  return current.direction === "ascending"
    ? t("library.column.sortDescending.hint", { column })
    : t("library.column.sortAscending.hint", { column });
}
