import type { Localized } from "@runyard/i18n";
import type { TemplateCategory } from "@runyard/protocol";
import type { ListPickerGroup } from "@runyard/ui";
import type { TemplateRow } from "../shared/library-state.ts";
import { monogramOf, pickLocalizedText } from "./library-view.ts";

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

export function buildPickerGroups(
  templates: readonly TemplateRow[],
  recent: readonly string[],
  locale: "en" | "zh-CN",
  labels: PickerLabels,
): ListPickerGroup[] {
  const item = (template: TemplateRow) => ({
    id: template.id,
    title: pickLocalizedText(template.name, locale),
    subtitle: pickLocalizedText(template.description, locale),
    tone: template.unmaintained ? ("warning" as const) : ("default" as const),
    letters: monogramOf(template.id),
  });
  const byId = new Map(templates.map((template) => [template.id, template]));
  const recentItems = recent.slice(0, RECENT_LIMIT).flatMap((id) => {
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
