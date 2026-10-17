export interface FitTabsInput {
  /** 每个标签完整显示时的宽度，按标签顺序 */
  widths: readonly number[];
  /** 标签条能用的宽度（已减去“＋”）；0 表示还没量到（测试环境、没挂载），全部显示 */
  available: number;
  /** 当前选中的标签下标；没有就是 -1 */
  selected: number;
  /** 哪些标签放不下时可以先缩成只剩图标 */
  shrinkable: readonly boolean[];
  /** 缩成图标后的宽度 */
  iconWidth: number;
  /** “+N”菜单按钮占的宽度（含它和标签之间的空隙） */
  moreWidth: number;
}

export interface FitTabsResult {
  /** 哪些标签缩成了图标 */
  iconOnly: boolean[];
  /** 哪些标签显示在条上；没显示的进“+N”菜单 */
  visible: boolean[];
}

// 标签放不下时的取舍（规格“窗口变窄”）：先把可缩的标签缩成图标；还不够，把后面的标签折进“+N”菜单。
// 当前选中的标签永远显示，其余按顺序尽量多放；折进菜单的一定是没放下的那些，顺序不乱。
export function fitTabs({
  widths,
  available,
  selected,
  shrinkable,
  iconWidth,
  moreWidth,
}: FitTabsInput): FitTabsResult {
  const count = widths.length;
  const all = Array.from({ length: count }, () => true);
  const none = Array.from({ length: count }, () => false);
  if (available <= 0) return { iconOnly: none, visible: all };
  const sum = (list: readonly number[]) => list.reduce((total, width) => total + width, 0);
  if (sum(widths) <= available) return { iconOnly: none, visible: all };
  const iconOnly = shrinkable.map((can) => can);
  const shrunk = widths.map((width, index) =>
    iconOnly[index] ? Math.min(width, iconWidth) : width,
  );
  if (sum(shrunk) <= available) return { iconOnly, visible: all };
  // 菜单按钮占位后，选中的先留位置，其余按顺序放，遇到第一个放不下的就停
  const room = available - moreWidth;
  const visible = none.slice();
  let used = 0;
  if (selected >= 0) {
    visible[selected] = true;
    used = shrunk[selected] ?? 0;
  }
  for (let index = 0; index < count; index += 1) {
    if (index === selected) continue;
    const width = shrunk[index] ?? 0;
    if (used + width > room) break;
    visible[index] = true;
    used += width;
  }
  return { iconOnly, visible };
}
