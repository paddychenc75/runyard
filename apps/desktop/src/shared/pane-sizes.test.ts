import { describe, expect, it } from "vitest";
import {
  CONSOLE_MIN_PX,
  EDITOR_MIN_PX,
  FILE_TREE_MAX_PX,
  FILE_TREE_MIN_PX,
  HANDLE_PX,
  layoutPanes,
  type PanePrefs,
  PREVIEW_COMPACT_MIN_PX,
  PREVIEW_MIN_PX,
  RAIL_PX,
  TOP_ROW_MIN_PX,
} from "./pane-sizes.ts";

const fresh: PanePrefs = {
  treeCollapsed: false,
  treeWidth: null,
  previewWidth: null,
  consoleHeight: null,
};
const box = { width: 1200, height: 700 };

describe("项目标签页的面板尺寸", () => {
  it("没拖过时是默认尺寸：文件树 216、输出面板 220，预览与编辑器约 1 比 1.05", () => {
    const { sizes } = layoutPanes(box, fresh, true);
    expect(sizes.tree).toBe(216);
    expect(sizes.console).toBe(220);
    const editor = box.width - sizes.tree - sizes.preview - 2 * HANDLE_PX;
    expect(editor / sizes.preview).toBeCloseTo(1.05, 1);
  });

  it("[DESKTOP-WORKSPACE-58] 拖得再远也停在最小和最大：文件树、预览、输出面板，编辑器永远留得下", () => {
    for (const extreme of [-10_000, 10_000]) {
      const { sizes } = layoutPanes(
        box,
        { ...fresh, treeWidth: extreme, previewWidth: extreme, consoleHeight: extreme },
        true,
      );
      const editor = box.width - sizes.tree - sizes.preview - 2 * HANDLE_PX;
      expect(editor).toBeGreaterThanOrEqual(EDITOR_MIN_PX);
      expect(sizes.tree).toBeGreaterThanOrEqual(FILE_TREE_MIN_PX);
      expect(sizes.tree).toBeLessThanOrEqual(FILE_TREE_MAX_PX);
      expect(sizes.preview).toBeGreaterThanOrEqual(PREVIEW_MIN_PX);
      expect(sizes.console).toBeGreaterThanOrEqual(CONSOLE_MIN_PX);
      expect(box.height - sizes.console - HANDLE_PX).toBeGreaterThanOrEqual(TOP_ROW_MIN_PX);
    }
    expect(layoutPanes(box, { ...fresh, treeWidth: -5 }, true).sizes.tree).toBe(FILE_TREE_MIN_PX);
    expect(layoutPanes(box, { ...fresh, consoleHeight: 1 }, true).sizes.console).toBe(
      CONSOLE_MIN_PX,
    );
  });

  it("窗口缩小后，以前拖出来的大尺寸会被压回能放下的范围", () => {
    const { sizes } = layoutPanes(
      { width: 900, height: 500 },
      { ...fresh, treeWidth: 480, previewWidth: 600 },
      true,
    );
    expect(900 - sizes.tree - sizes.preview - 2 * HANDLE_PX).toBeGreaterThanOrEqual(EDITOR_MIN_PX);
  });

  it("[DESKTOP-WORKSPACE-60] 文件树收起：它的宽度是 0，只留窄条，编辑器多出它的位置", () => {
    const open = layoutPanes(box, fresh, true).sizes;
    const closed = layoutPanes(box, { ...fresh, treeCollapsed: true }, true).sizes;
    expect(closed.tree).toBe(0);
    const editorOpen = box.width - open.tree - open.preview - 2 * HANDLE_PX;
    const editorClosed = box.width - RAIL_PX - closed.preview - HANDLE_PX;
    expect(editorClosed).toBeGreaterThan(editorOpen);
  });

  it("脚本项目没有输出面板：高度是 0", () => {
    expect(layoutPanes(box, fresh, false).sizes.console).toBe(0);
  });

  it("[DESKTOP-WORKSPACE-77] 侧栏展开使容器变窄时：文件树自动收成窄条、预览压到下限，编辑器仍不小于 420", () => {
    const narrow = { width: 724, height: 700 };
    const { sizes, treeCollapsed } = layoutPanes(narrow, fresh, true);
    expect(treeCollapsed).toBe(true);
    expect(sizes.tree).toBe(0);
    expect(sizes.preview).toBeGreaterThanOrEqual(PREVIEW_COMPACT_MIN_PX);
    expect(narrow.width - RAIL_PX - sizes.preview - HANDLE_PX).toBeGreaterThanOrEqual(
      EDITOR_MIN_PX,
    );
    // 宽容器不受影响，手动偏好不被改写
    expect(layoutPanes(box, fresh, true).treeCollapsed).toBe(false);
  });
});
