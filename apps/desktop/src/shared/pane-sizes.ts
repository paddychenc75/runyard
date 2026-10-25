import { numbers } from "@runyard/tokens";
import { CONSOLE_HEIGHT_PX, FILE_TREE_WIDTH_PX } from "./layout.ts";

// 项目标签页里各面板的尺寸规则（规格 DESKTOP-WORKSPACE-55 至 61）：纯函数，不碰 DOM。
// 界面只量出容器的大小，范围和夹紧都在这里算，拖动时每一帧都用同一份规则。

export const FILE_TREE_MIN_PX = 160;
export const FILE_TREE_MAX_PX = 480;
export const EDITOR_MIN_PX = 420;
export const PREVIEW_MIN_PX = 280;
export const CONSOLE_MIN_PX = 96;
/** 三栏那一行至少留这么高，输出面板拖得再高也压不掉它 */
export const TOP_ROW_MIN_PX = 160;

/** 分隔条占的宽度：就是卡片之间的间距 */
export const HANDLE_PX = numbers["size-card-gap"];
/** 文件树收起后留下的窄条（放“展开”按钮）：控件高度加一个间距 */
export const RAIL_PX = numbers["size-control-lg"] + HANDLE_PX;
/** 预览没有被拖过时和编辑器的比例（设计稿：编辑器 1.05、预览 1） */
const PREVIEW_SHARE = 1 / 2.05;

export interface Range {
  min: number;
  max: number;
}

export interface PaneSizes {
  /** 文件树宽度；收起时是 0 */
  tree: number;
  preview: number;
  console: number;
}

export interface PanePrefs {
  treeCollapsed: boolean;
  /** null 是还没拖过，用默认 */
  treeWidth: number | null;
  previewWidth: number | null;
  consoleHeight: number | null;
}

export interface PaneRanges {
  tree: Range;
  preview: Range;
  console: Range;
}

/** 夹进范围；范围反了（容器太小）时以最小值为准 */
export function clamp(value: number, range: Range): number {
  return Math.round(Math.max(range.min, Math.min(range.max, value)));
}

/** 容器宽高下各面板的有效尺寸和可拖的范围 */
export function layoutPanes(
  container: { width: number; height: number },
  prefs: PanePrefs,
  hasConsole: boolean,
): { sizes: PaneSizes; ranges: PaneRanges } {
  const left = prefs.treeCollapsed ? RAIL_PX : 0;
  const handles = prefs.treeCollapsed ? HANDLE_PX : 2 * HANDLE_PX;
  const treeRange: Range = {
    min: FILE_TREE_MIN_PX,
    max: Math.max(
      FILE_TREE_MIN_PX,
      Math.min(FILE_TREE_MAX_PX, container.width - handles - EDITOR_MIN_PX - PREVIEW_MIN_PX),
    ),
  };
  const tree = prefs.treeCollapsed ? 0 : clamp(prefs.treeWidth ?? FILE_TREE_WIDTH_PX, treeRange);
  const rest = container.width - left - tree - handles;
  const previewRange: Range = {
    min: PREVIEW_MIN_PX,
    max: Math.max(PREVIEW_MIN_PX, rest - EDITOR_MIN_PX),
  };
  const preview = clamp(prefs.previewWidth ?? rest * PREVIEW_SHARE, previewRange);
  const consoleRange: Range = {
    min: CONSOLE_MIN_PX,
    max: Math.max(CONSOLE_MIN_PX, container.height - HANDLE_PX - TOP_ROW_MIN_PX),
  };
  const consoleSize = hasConsole
    ? clamp(prefs.consoleHeight ?? CONSOLE_HEIGHT_PX, consoleRange)
    : 0;
  return {
    sizes: { tree, preview, console: consoleSize },
    ranges: { tree: treeRange, preview: previewRange, console: consoleRange },
  };
}
