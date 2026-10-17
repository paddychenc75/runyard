import type { Playground } from "@runyard/protocol";
import type { TemplateRow } from "../shared/library-state.ts";

/** 按项目的创建时间从新到旧，取用过的模板，同一个模板只算一次；不在模板列表里的（已删除的用户模板）略过 */
export function recentTemplateIds(
  playgrounds: readonly Playground[],
  templates: readonly TemplateRow[],
): string[] {
  const known = new Set(templates.map((template) => template.id));
  const recent: string[] = [];
  for (const playground of [...playgrounds].sort((a, b) => b.createdAt - a.createdAt)) {
    const id = playground.template.id;
    if (known.has(id) && !recent.includes(id)) recent.push(id);
  }
  return recent;
}
