import type { Localized } from "@runyard/i18n";
import {
  type CSSProperties,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ScrollArea } from "../../primitives/ScrollArea/index.ts";
import styles from "./DataTable.module.css";

/** 列宽的档位，对应设计变量 size-column-*；fill 和 flex 分剩下的宽度（fill 占 1.5 份，flex 占 1 份） */
export type DataTableColumnWidth = "fill" | "flex" | "icon" | "sm" | "md" | "lg" | "xl";

export interface DataTableColumn<Row> {
  id: string;
  /** 表头文字；操作列没有可见表头，给 hiddenHeader 作为读屏器的名字 */
  header?: Localized;
  hiddenHeader?: Localized;
  width: DataTableColumnWidth;
  /** start：窗口变窄横向滚动时固定在左；end：固定在右 */
  pin?: "start" | "end";
  render: (row: Row) => ReactNode;
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
  /** 被选中的行的 id：行底色变强调色淡底，左边多一条强调线 */
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
};

const MIN: Record<DataTableColumnWidth, string> = {
  ...TRACK,
  fill: "var(--size-column-fill-min)",
  flex: "var(--size-column-flex-min)",
};

// 一个自带滚动的表格：竖向滚动时表头钉在上面；窗口窄到放不下时整张表横向滚动，
// 标了 pin 的列留在两侧（PRD #prd-library-list 的窄窗口规则，设计稿 MainNarrow）。
// 放不下的时候给根元素加 data-overflowing；单元格里带 data-when-overflowing 的元素只在这时显示
// （如固定的名称列里补一个状态圆点）。
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
  const [overflowing, setOverflowing] = useState(false);
  // 可见宽度：通栏说明按它定宽并钉在左边，窄窗口横向滚动时文字和按钮不被滚走
  const [viewport, setViewport] = useState<number | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    const table = tableRef.current;
    if (root === null || table === null) return;
    if (typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setOverflowing(table.offsetWidth > root.clientWidth + 1);
      setViewport(root.clientWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(table);
    measure();
    return () => observer.disconnect();
  }, []);

  const vars = {
    "--table-columns": columns.map((column) => TRACK[column.width]).join(" "),
    "--table-min": `calc(${columns.map((column) => MIN[column.width]).join(" + ")})`,
    ...(viewport === null ? {} : { "--table-viewport": `${viewport}px` }),
  } as CSSProperties;

  return (
    <ScrollArea
      ref={rootRef}
      orientation="both"
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-overflowing={overflowing ? "" : undefined}
    >
      <table ref={tableRef} aria-label={label} className={styles.table} style={vars}>
        <thead className={styles.head}>
          <tr className={styles.row}>
            {columns.map((column) => (
              <th key={column.id} scope="col" className={styles.headerCell} data-pin={column.pin}>
                {column.header ?? (
                  <span className={styles.hidden} data-truncate="">
                    {column.hiddenHeader}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={styles.body}>
          {rows.map((row) => {
            const id = getRowId(row);
            const detail = renderDetail?.(row) ?? null;
            return (
              <Fragment key={id}>
                {/* 行本身不是控件：整行点击只是鼠标的便利，键盘用户用行里的按钮 */}
                <tr
                  className={styles.row}
                  data-row-id={id}
                  data-has-detail={detail === null ? undefined : ""}
                  data-selected={id === selectedId ? "" : undefined}
                  data-editing={id === editingId ? "" : undefined}
                  onClick={onRowClick === undefined ? undefined : (event) => onRowClick(row, event)}
                  onDoubleClick={
                    onRowDoubleClick === undefined
                      ? undefined
                      : (event) => onRowDoubleClick(row, event)
                  }
                >
                  {visibleCells(columns, row, cellSpan).map(({ column, span }) => (
                    <td
                      key={column.id}
                      className={styles.cell}
                      data-pin={column.pin}
                      data-column={column.id}
                      data-span={span > 1 ? span : undefined}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
                {detail === null ? null : (
                  <tr className={styles.detail} data-detail-for={id} data-tone={detail.tone}>
                    <td colSpan={columns.length} className={styles.detailCell}>
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
