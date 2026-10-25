import { numbers } from "@runyard/tokens";
import { CONSOLE_HEIGHT_PX, FILE_TREE_WIDTH_PX } from "./layout.ts";

// 项目标签页里各面板的尺寸规则（规格 DESKTOP-WORKSPACE-55 至 61）：纯函数，不碰 DOM。
// 界面只量出容器的大小，范围和夹紧都在这里算，拖动时每一帧都用同一份规则。

export const FILE_TREE_MIN_PX = 160;
export const FILE_TREE_MAX_PX = 480;
export const EDITOR_MIN_PX = 420;
export const PREVIEW_MIN_PX = 280;
/** 窄窗口（全局侧栏展开占去 264）下预览可压到的下限；编辑器 420 不让 */
export const PREVIEW_COMPACT_MIN_PX = 200;
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
): {
  sizes: PaneSizes;
  ranges: PaneRanges;
  /** 文件树是不是只剩窄条（手动收起或放不下自动收起） */
  treeCollapsed: boolean;
  /** 预览（脚本是输出）放不下时整块收起，不占位；编辑器保底 420 */
  previewHidden: boolean;
  /** 连窄条也放不下时文件树整块隐藏 */
  treeHidden: boolean;
} {
  // 放不下“文件树最小宽 + 编辑器 420 + 预览最小宽”时，文件树自动收成窄条（不改手动偏好），先保编辑器
  const treeAuto =
    !prefs.treeCollapsed &&
    container.width < FILE_TREE_MIN_PX + EDITOR_MIN_PX + PREVIEW_MIN_PX + 2 * HANDLE_PX;
  const treeCollapsed = prefs.treeCollapsed || treeAuto;
  // 窗口再窄（侧栏展开占去 264）：窄条下连预览最小下限也放不下就收起预览；窄条也放不下就连文件树一起隐藏（UI 走查 #546，负责人 2026-10-26）
  const previewHidden =
    treeCollapsed && container.width < RAIL_PX + EDITOR_MIN_PX + HANDLE_PX + PREVIEW_COMPACT_MIN_PX;
  const treeHidden = previewHidden && container.width < RAIL_PX + EDITOR_MIN_PX;
  const left = treeHidden ? 0 : treeCollapsed ? RAIL_PX : 0;
  const handles = previewHidden ? 0 : treeCollapsed ? HANDLE_PX : 2 * HANDLE_PX;
  const treeRange: Range = {
    min: FILE_TREE_MIN_PX,
    max: Math.max(
      FILE_TREE_MIN_PX,
      Math.min(FILE_TREE_MAX_PX, container.width - handles - EDITOR_MIN_PX - PREVIEW_MIN_PX),
    ),
  };
  const tree = treeCollapsed ? 0 : clamp(prefs.treeWidth ?? FILE_TREE_WIDTH_PX, treeRange);
  const rest = container.width - left - tree - handles;
  const previewMin = Math.min(
    PREVIEW_MIN_PX,
    Math.max(PREVIEW_COMPACT_MIN_PX, rest - EDITOR_MIN_PX),
  );
  const previewRange: Range = {
    min: previewMin,
    max: Math.max(previewMin, rest - EDITOR_MIN_PX),
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
    treeCollapsed,
    previewHidden,
    treeHidden,
    sizes: { tree, preview, console: consoleSize },
    ranges: { tree: treeRange, preview: previewRange, console: consoleRange },
  };
}
