import type { Locale } from "@runyard/i18n";
import type { TemplateCategory } from "@runyard/protocol";
import { lastUsedAt } from "../shared/last-used.ts";
import type { PlaygroundRow, TemplateRow } from "../shared/library-state.ts";
import { nameProblem } from "./create-view.ts";
import { creatorOf, pickLocalizedText, statusMarkOf } from "./library-view.ts";

// 资源库页的搜索、筛选和排序（规格 DESKTOP-LIBRARY-VIEW-13 至 26）：纯函数，不碰 DOM、不生成文字。
// 搜索框、三个下拉和侧栏固定筛选同时生效，取交集。

/** 侧栏“资源库”组的四个固定筛选 */
export type NavFilter = "all" | "running" | "autoClean" | "agent";
export const navFilters: readonly NavFilter[] = ["all", "running", "agent", "autoClean"];

/** 类型下拉的选项：与模板选择器的分组一致（“我的”不是类型，项目按所用模板的分组归类） */
export type TypeFilter = "all" | Exclude<TemplateCategory, "mine">;
export const typeFilters: readonly TypeFilter[] = [
  "all",
  "page",
  "frontend",
  "fullstack",
  "script",
  "service",
];

export type StatusFilter = "all" | "running" | "stopped" | "problem";
export const statusFilters: readonly StatusFilter[] = ["all", "running", "stopped", "problem"];

export type SortKey = "recent" | "name" | "created" | "size";
export const sortKeys: readonly SortKey[] = ["recent", "name", "created", "size"];

/** 排序方向：ascending 升序，descending 降序 */
export type SortDirection = "ascending" | "descending";

/** 每个排序键第一次选中时的方向：最近使用最新在前、大小最大在前、创建时间最新在前，名称 A→Z */
export function defaultDirection(sort: SortKey): SortDirection {
  return sort === "name" ? "ascending" : "descending";
}

export function reverseDirection(direction: SortDirection): SortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}

export interface LibraryQuery {
  search: string;
  nav: NavFilter;
  type: TypeFilter;
  status: StatusFilter;
  sort: SortKey;
  sortDirection: SortDirection;
}

export const defaultQuery: LibraryQuery = {
  search: "",
  nav: "all",
  type: "all",
  status: "all",
  sort: "recent",
  sortDirection: "descending",
};

/**
 * 点表头或在排序下拉里选一项：选的不是当前排序键就换键并用它的默认方向；
 * 选当前键就在升序和降序之间切换（规格 DESKTOP-LIBRARY-VIEW-110）。
 */
export function applySortChoice(
  query: LibraryQuery,
  sort: SortKey,
): Pick<LibraryQuery, "sort" | "sortDirection"> {
  if (sort === query.sort) return { sort, sortDirection: reverseDirection(query.sortDirection) };
  return { sort, sortDirection: defaultDirection(sort) };
}

/** 有搜索或任何筛选在起作用（页概况改写成“N 个结果 · 共 M 个项目”）；排序不算筛选 */
export function isFiltering(query: LibraryQuery): boolean {
  return (
    query.search !== "" || query.nav !== "all" || query.type !== "all" || query.status !== "all"
  );
}

/** 项目的状态分组：找不到文件夹和失败类算“有问题”，进行中的（含安装、启动）算“运行中”，其余已停止 */
export function statusGroupOf(row: PlaygroundRow): Exclude<StatusFilter, "all"> {
  if (row.missing) return "problem";
  const mark = statusMarkOf(row.state);
  if (mark === "crashed") return "problem";
  return mark === "stopped" ? "stopped" : "running";
}

function inNav(row: PlaygroundRow, nav: NavFilter): boolean {
  switch (nav) {
    case "all":
      return true;
    case "running":
      return statusGroupOf(row) === "running";
    case "autoClean":
      return row.autoClean.enabled;
    case "agent":
      return creatorOf(row).kind === "agent";
  }
}

/** 侧栏每一项右边的数字；各筛选独立计数，运行中沿用状态筛选的定义 */
export function navCounts(rows: readonly PlaygroundRow[]): Record<NavFilter, number> {
  const counts = { all: 0, running: 0, autoClean: 0, agent: 0 };
  for (const nav of navFilters) counts[nav] = rows.filter((row) => inNav(row, nav)).length;
  return counts;
}

/** 搜索：名称、备注、模板名（和模板 id）里含有这段文字，不分大小写；不按标签匹配（PRD #prd-search-filter） */
function matchesSearch(row: PlaygroundRow, needle: string, locale: Locale): boolean {
  if (needle === "") return true;
  const templateName = row.templateName === null ? "" : pickLocalizedText(row.templateName, locale);
  return [row.name, row.note, templateName, row.templateId].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

/** 按排序键的“升序”比较（数值小的在前、名称 A→Z）；同值时按名称，名称相同无所谓 */
function compareAscending(sort: SortKey, a: PlaygroundRow, b: PlaygroundRow): number {
  if (sort === "size") return (a.size?.totalBytes ?? 0) - (b.size?.totalBytes ?? 0);
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "created") return a.createdAt - b.createdAt;
  // 最近使用：打开、命令行运行、创建里最近的一次（规格 DESKTOP-LIBRARY-VIEW-01、94）
  return lastUsedAt(a) - lastUsedAt(b);
}

function compare(query: LibraryQuery, a: PlaygroundRow, b: PlaygroundRow): number {
  const { sort, sortDirection } = query;
  // 大小：还在计算的和没有大小的无论升降序都排在最后（规格 DESKTOP-LIBRARY-VIEW-76）
  if (sort === "size") {
    const aKnown = a.size !== null && a.size !== undefined;
    const bKnown = b.size !== null && b.size !== undefined;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
  }
  const sign = sortDirection === "ascending" ? 1 : -1;
  return sign * compareAscending(sort, a, b) || a.name.localeCompare(b.name);
}

export function filterRows(
  rows: readonly PlaygroundRow[],
  templates: readonly TemplateRow[],
  locale: Locale,
  query: LibraryQuery,
): PlaygroundRow[] {
  const needle = query.search.toLowerCase();
  const categoryById = new Map(templates.map((template) => [template.id, template.category]));
  return rows
    .filter(
      (row) =>
        inNav(row, query.nav) &&
        (query.type === "all" || categoryById.get(row.templateId) === query.type) &&
        (query.nav === "running" ||
          query.status === "all" ||
          statusGroupOf(row) === query.status) &&
        matchesSearch(row, needle, locale),
    )
    .sort((a, b) => {
      // 无论哪种排序，运行中的都在最前
      if (a.active !== b.active) return a.active ? -1 : 1;
      return compare(query, a, b);
    });
}

/** 没有结果画面上的“新建项目，名称用…”：搜索文字是合法且没被占用的项目名才给（PRD #prd-naming） */
export function canCreateFromSearch(search: string, rows: readonly PlaygroundRow[]): boolean {
  return (
    search !== "" &&
    nameProblem(
      search,
      rows.map((row) => row.name),
    ) === null
  );
}
