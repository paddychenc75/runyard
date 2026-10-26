import type { Localized } from "@runyard/i18n";
import {
  type CSSProperties,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../../primitives/Icon/index.ts";
import { ScrollArea } from "../../primitives/ScrollArea/index.ts";
import styles from "./DataTable.module.css";

/** 列宽的档位，对应设计变量 size-column-*；fill 和 flex 分剩下的宽度（fill 占 1.5 份，flex 占 1 份） */
export type DataTableColumnWidth = "fill" | "flex" | "icon" | "sm" | "md" | "lg" | "xl" | "xxl";

/** 已有设计变量组合出的固定列宽；另一列收起时可切换宽度，不在通用组件里认识业务。 */
export interface DataTableColumnSize {
  size: string;
  compact?: { whenCollapsed: string; size: string };
}
type ColumnSize = DataTableColumnWidth | DataTableColumnSize;

/** 一格渲染时知道的：这一行是否选中、在行内编辑，以及这一列此刻是否被收窄 */
export interface DataTableCellContext {
  selected: boolean;
  editing: boolean;
  collapsed: boolean;
}

export interface DataTableColumn<Row> {
  id: string;
  /** 表头文字；操作列没有可见表头，给 hiddenHeader 作为读屏器的名字 */
  header?: Localized;
  hiddenHeader?: Localized;
  width: ColumnSize;
  /** 数字列靠右；可点表头与页面排序使用同一个动作。 */
  align?: "end";
  sort?: { sorted: boolean; onSort: () => void };
  /**
   * 窗口放不下全部列时怎么办：order 小的先收。hide 是整列不画；narrow 是列缩成 narrowWidth，
   * 内容里带 data-collapse-hide 的部分不画（如模板列只剩徽标）。没有这一项的列一直显示
   */
  collapse?: { order: number; mode: "hide" | "narrow"; narrowWidth?: ColumnSize };
  /** 平时看不见，鼠标移到行上、行被选中或焦点进入这一行时才显示（仍在无障碍树里） */
  reveal?: boolean;
  render: (row: Row, context: DataTableCellContext) => ReactNode;
}

/** 行下面通栏的一条说明（设计稿 FolderMissing 的“找不到文件夹”说明、AgentActivity 展开的创建信息） */
export interface DataTableDetail {
  content: ReactNode;
  /** warning：警示色淡底；neutral：中性淡底 */
  tone: "warning" | "neutral";
}

export interface DataTableProps<Row> {
  /** 表格的名字，读屏器靠它 */
  label: Localized;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  /** 被选中的行的 id：整行淡强调色底；表格没有焦点时改成灰底 */
  selectedId?: string | null;
  /** 正在行内编辑的行：行高随内容，底色和边框换成编辑状态（设计稿 RenameInline） */
  editingId?: string | null;
  /** 某行的某一格向右占几列（含自己，默认 1）；被占掉的列不画。编辑中的行靠它让输入框横跨几列 */
  cellSpan?: (row: Row, columnId: string) => number;
  /** 某行下面要不要接一条通栏说明；返回 null 就没有。说明不是数据行，不算在行里（选中、双击都只属于数据行） */
  renderDetail?: (row: Row) => DataTableDetail | null;
  onRowClick?: (row: Row, event: MouseEvent<HTMLElement>) => void;
  onRowDoubleClick?: (row: Row, event: MouseEvent<HTMLElement>) => void;
  className?: string;
}

const TRACK: Record<DataTableColumnWidth, string> = {
  fill: "minmax(var(--size-column-fill-min), 1.5fr)",
  flex: "minmax(var(--size-column-flex-min), 1fr)",
  icon: "var(--size-column-icon)",
  sm: "var(--size-column-sm)",
  md: "var(--size-column-md)",
  lg: "var(--size-column-lg)",
  xl: "var(--size-column-xl)",
  xxl: "var(--size-column-xxl)",
};

const MIN: Record<DataTableColumnWidth, string> = {
  ...TRACK,
  fill: "var(--size-column-fill-min)",
  flex: "var(--size-column-flex-min)",
};

/**
 * 放不放得下，看各列最小宽之和（表的 min-inline-size）与可见宽度，不看表现在实际多宽（#404）。
 * 读不出最小宽（非浏览器环境）时才退回实际宽度
 */
export function tableOverflows(table: HTMLElement, root: HTMLElement): boolean {
  const min = Number.parseFloat(getComputedStyle(table).minWidth);
  return (Number.isFinite(min) ? min : table.offsetWidth) > root.clientWidth + 1;
}

// 一个自带竖向滚动的表格：滚动时表头钉在上面；窗口放不下全部列时不横向滚动，
// 按 collapse 的顺序一列一列收起（PRD #prd-library-list 的窄窗口规则，设计稿 MainNarrow），
// 变宽后按相反顺序恢复。被收窄的列的 id 记在根元素的 data-collapsed 上，
// 内容里带 data-when-collapsed="<列 id>" 的元素只在那一列被收起时显示（如收掉端口列后写在状态后面的端口）。
// 表格自己是一个 Tab 停点；单击行后焦点留在表格上，选中行用淡强调色，失焦后改灰底。
export function DataTable<Row>({
  label,
  columns,
  rows,
  getRowId,
  selectedId = null,
  editingId = null,
  cellSpan,
  renderDetail,
  onRowClick,
  onRowDoubleClick,
  className,
}: DataTableProps<Row>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const lastWidth = useRef<number | null>(null);
  // 已经收起的步数：从 0 开始，每次放不下就多收一步，窗口宽度变了从头再试
  const [level, setLevel] = useState(0);
  // 宽度变了要让上面的检查重跑一遍，即使 level 本来就是 0
  const [, setTick] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const steps = columns
    .filter((column) => column.collapse !== undefined)
    .sort((a, b) => (a.collapse?.order ?? 0) - (b.collapse?.order ?? 0));
  const collapsedIds = new Set(steps.slice(0, level).map((column) => column.id));
  const visible = columns.filter(
    (column) => !(collapsedIds.has(column.id) && column.collapse?.mode === "hide"),
  );
  const widthOf = (column: DataTableColumn<Row>): ColumnSize =>
    collapsedIds.has(column.id) && column.collapse?.mode === "narrow"
      ? (column.collapse.narrowWidth ?? "icon")
      : column.width;

  // 放不下就多收一步；每次渲染后都看一眼，直到放得下或没有可收的列
  useLayoutEffect(() => {
    const root = rootRef.current;
    const table = tableRef.current;
    if (root === null || table === null) return;
    if (!tableOverflows(table, root)) return;
    if (level < steps.length) setLevel(level + 1);
  });
  // 宽度变了（窗口缩放、侧栏收起）重新从不收列开始试，变宽才能恢复
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (root.clientWidth === lastWidth.current) return;
      lastWidth.current = root.clientWidth;
      setLevel(0);
      setTick((tick) => tick + 1);
    });
    observer.observe(root);
    lastWidth.current = root.clientWidth;
    return () => observer.disconnect();
  }, []);

  const trackOf = (width: ColumnSize, minimum = false): string => {
    if (typeof width === "string") return (minimum ? MIN : TRACK)[width];
    return width.compact !== undefined && collapsedIds.has(width.compact.whenCollapsed)
      ? width.compact.size
      : width.size;
  };
  const vars = {
    "--table-columns": visible.map((column) => trackOf(widthOf(column))).join(" "),
    // 各列最小宽加上列间距（space-7）和行两侧内边距（space-6 加 space-1，即 14）
    "--table-min": `calc(${visible.map((column) => trackOf(widthOf(column), true)).join(" + ")} + ${visible.length - 1} * var(--table-gap, var(--space-7)) + 2 * var(--table-padding, calc(var(--space-6) + var(--space-1))))`,
  } as CSSProperties;

  return (
    <ScrollArea
      ref={rootRef}
      orientation="vertical"
      viewportProps={{ tabIndex: -1 }}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-collapsed={collapsedIds.size === 0 ? undefined : [...collapsedIds].join(" ")}
    >
      <table
        ref={tableRef}
        aria-label={label}
        className={styles.table}
        style={vars}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: 表格整体是一个 Tab 停点，单击行后焦点留在这里，选中行的键盘由它接管（规格 DESKTOP-LIBRARY-VIEW-96，#457）
        tabIndex={0}
        data-has-selection={selectedId === null ? undefined : ""}
      >
        <thead className={styles.head}>
          <tr className={styles.row}>
            {visible.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={styles.headerCell}
                data-align={column.align}
                aria-sort={column.sort?.sorted === true ? "descending" : undefined}
                data-column={column.id}
                data-collapsed={collapsedIds.has(column.id) ? "" : undefined}
              >
                {collapsedIds.has(column.id) && column.collapse?.mode === "narrow" ? (
                  <span className={styles.hidden}>{column.header ?? column.hiddenHeader}</span>
                ) : column.sort !== undefined && column.header !== undefined ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className={styles.sortButton}
                    onClick={column.sort.onSort}
                  >
                    <span data-truncate="">{column.header}</span>
                    {column.sort.sorted ? <Icon name="chevron-down" size={10} /> : null}
                  </button>
                ) : (
                  (column.header ?? (
                    <span className={styles.hidden} data-truncate="">
                      {column.hiddenHeader}
                    </span>
                  ))
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={styles.body}>
          {rows.map((row) => {
            const id = getRowId(row);
            const detail = renderDetail?.(row) ?? null;
            const selected = id === selectedId;
            const editing = id === editingId;
            return (
              <Fragment key={id}>
                {/* 行本身不是控件：整行点击只是鼠标的便利，键盘用户用行里的按钮 */}
                <tr
                  className={styles.row}
                  data-row-id={id}
                  data-has-detail={detail === null ? undefined : ""}
                  data-selected={selected ? "" : undefined}
                  data-editing={editing ? "" : undefined}
                  data-revealed={selected || hovered === id || focused === id ? "" : undefined}
                  onMouseEnter={() => setHovered(id)}
                  onMouseLeave={() => setHovered((current) => (current === id ? null : current))}
                  onFocus={() => setFocused(id)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                      setFocused((current) => (current === id ? null : current));
                  }}
                  onClick={onRowClick === undefined ? undefined : (event) => onRowClick(row, event)}
                  onDoubleClick={
                    onRowDoubleClick === undefined
                      ? undefined
                      : (event) => onRowDoubleClick(row, event)
                  }
                >
                  {visibleCells(visible, row, cellSpan).map(({ column, span }) => (
                    <td
                      key={column.id}
                      className={styles.cell}
                      data-column={column.id}
                      data-align={column.align}
                      data-reveal={column.reveal === true ? "" : undefined}
                      data-collapsed={collapsedIds.has(column.id) ? "" : undefined}
                      data-span={span > 1 ? span : undefined}
                    >
                      {column.render(row, {
                        selected,
                        editing,
                        collapsed: collapsedIds.has(column.id),
                      })}
                    </td>
                  ))}
                </tr>
                {detail === null ? null : (
                  <tr className={styles.detail} data-detail-for={id} data-tone={detail.tone}>
                    <td colSpan={visible.length} className={styles.detailCell}>
                      {detail.content}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}

// 把“向右占几列”换成要画的格子：被前一格占掉的列跳过
function visibleCells<Row>(
  columns: readonly DataTableColumn<Row>[],
  row: Row,
  cellSpan: ((row: Row, columnId: string) => number) | undefined,
): { column: DataTableColumn<Row>; span: number }[] {
  const cells: { column: DataTableColumn<Row>; span: number }[] = [];
  let skip = 0;
  for (const column of columns) {
    if (skip > 0) {
      skip -= 1;
      continue;
    }
    const span = Math.max(1, cellSpan?.(row, column.id) ?? 1);
    skip = span - 1;
    cells.push({ column, span });
  }
  return cells;
}
