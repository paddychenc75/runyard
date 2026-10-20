import type { Localized } from "@runyard/i18n";
import type { TemplateCategory } from "@runyard/protocol";
import type { ListPickerGroup, ListPickerRailItem } from "@runyard/ui";
import type { TemplateRow } from "../shared/library-state.ts";
import { brandOf, logoOf, monogramOf, pickLocalizedText } from "./library-view.ts";

// 模板选择器的数据：顶部“最近使用”，其后按类型分组。只用已有的信息（模板列表和创建过的项目），
// 不查工具：缺工具的模板照常显示可选（规格 DESKTOP-CREATE-FLOW-02、PRD #prd-missing-runtime-prompt）。

/** 分组的固定顺序（设计稿 Picker） */
export const categoryOrder: readonly TemplateCategory[] = [
  "page",
  "frontend",
  "fullstack",
  "script",
  "service",
  "mine",
];

/** “最近使用”最多显示几个（设计稿 Picker 是三个） */
const RECENT_LIMIT = 3;

/** 分组标题；由调用方用文案包生成 */
export interface PickerLabels {
  recent: Localized;
  categories: Record<TemplateCategory, Localized>;
}

/** 搜索：名称、标识或说明里含有这段文字（不分大小写）的模板（规格 DESKTOP-CREATE-FLOW-17） */
export function matchTemplates(
  templates: readonly TemplateRow[],
  search: string,
  locale: "en" | "zh-CN",
): TemplateRow[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return [...templates];
  return templates.filter((template) =>
    [
      template.id,
      pickLocalizedText(template.name, locale),
      pickLocalizedText(template.description, locale),
    ].some((text) => text.toLowerCase().includes(needle)),
  );
}

export function buildPickerGroups(
  templates: readonly TemplateRow[],
  recent: readonly string[],
  locale: "en" | "zh-CN",
  labels: PickerLabels,
  /** 搜索时不显示“最近使用”分组 */
  searching = false,
): ListPickerGroup[] {
  const item = (template: TemplateRow) => ({
    id: template.id,
    userContent: true as const,
    title: pickLocalizedText(template.name, locale),
    subtitle: pickLocalizedText(template.description, locale),
    tone: template.unmaintained ? ("warning" as const) : ("default" as const),
    letters: monogramOf(template.id),
    logo: logoOf(template.id),
    brand: brandOf(template.id),
  });
  const byId = new Map(templates.map((template) => [template.id, template]));
  const recentItems = (searching ? [] : recent.slice(0, RECENT_LIMIT)).flatMap((id) => {
    const template = byId.get(id);
    return template === undefined ? [] : [item(template)];
  });
  const groups: ListPickerGroup[] = [];
  if (recentItems.length > 0) {
    groups.push({
      id: "recent",
      title: labels.recent,
      items: recentItems,
    });
  }
  for (const category of categoryOrder) {
    const inCategory = templates.filter((template) => template.category === category);
    if (inCategory.length === 0) continue;
    groups.push({
      id: category,
      title: labels.categories[category],
      items: inCategory.map(item),
    });
  }
  return groups;
}

/**
 * 左侧分类栏（设计稿 Picker，规格 DESKTOP-CREATE-FLOW-22）：有“最近使用”时它在最上面，接着“全部”，
 * 然后是有模板的类型。栏只负责跳转，所以每一项就是列表里的一个分组；“全部”的个数是不重复的模板总数
 * （同一个模板可以同时在“最近使用”和它的类型里）
 */
export function buildPickerRail(
  groups: readonly ListPickerGroup[],
  allLabel: Localized,
): ListPickerRailItem[] {
  const entry = (group: ListPickerGroup): ListPickerRailItem => ({
    id: group.id,
    label: group.title,
    count: group.items.length,
    groupId: group.id,
  });
  const total = new Set(groups.flatMap((group) => group.items.map((item) => item.id))).size;
  const all: ListPickerRailItem = { id: "all", label: allLabel, count: total };
  const [first, ...rest] = groups;
  return first?.id === "recent"
    ? [entry(first), all, ...rest.map(entry)]
    : [all, ...groups.map(entry)];
}
