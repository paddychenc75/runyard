import { useFormat, useT } from "@runyard/i18n/react";
import { type DataTableColumn, Tooltip, UserText } from "@runyard/ui";
import type { PlaygroundRow, RowSize } from "../../shared/library-state.ts";
import { sizeCellOf } from "../size-view.ts";
import styles from "./LibrarySizeColumn.module.css";

// 没有值的格子写一条短横线（设计稿 FolderMissing）
const NONE = "—";

// “大小”列（规格 DESKTOP-LIBRARY-VIEW-73 至 77）：格子和列定义放在这一个文件里，表格只引用 sizeColumn()，
// 表格重新设计（#398）时整列可以原样搬走。

/** 一格：数字（等宽、右对齐）、较淡的“计算中”或“—”；悬停看依赖占多少 */
export function SizeCell({ row }: { row: PlaygroundRow }) {
  const t = useT();
  const format = useFormat();
  const cell = sizeCellOf(row);
  if (cell.kind === "none") return <span className={styles.muted}>{NONE}</span>;
  if (cell.kind === "calculating")
    return <span className={styles.muted}>{t("library.size.calculating.label")}</span>;
  const size = format.fileSize(cell.bytes);
  const text = cell.atLeast ? t("library.size.atLeast.label", { size }) : size;
  // 有数字就一定有 size；类型上不是必有，所以断言
  const detail = row.size as RowSize;
  return (
    <Tooltip
      content={
        <span className={styles.tip}>
          {detail.dependencyDirs.length === 0 ? (
            <span>{t("library.size.noDependencies.tooltip")}</span>
          ) : (
            <>
              <span>
                {t("library.size.dependencies.tooltip", {
                  size: format.fileSize(detail.dependencyBytes),
                  dirs: dirsText(detail.dependencyDirs, t),
                })}
              </span>
              <span>
                {t("library.size.rest.tooltip", {
                  size: format.fileSize(detail.totalBytes - detail.dependencyBytes),
                })}
              </span>
            </>
          )}
          {detail.unreadable > 0 ? (
            <span>{t("library.size.unreadable.tooltip", { count: detail.unreadable })}</span>
          ) : null}
        </span>
      }
    >
      <UserText className={styles.number}>{text}</UserText>
    </Tooltip>
  );
}

/** 列定义：右对齐；点表头等于在排序里选“大小”（sorted 为真时表头旁有向下的箭头） */
export function sizeColumn(
  header: DataTableColumn<PlaygroundRow>["header"],
  sorted: boolean,
  onSort: () => void,
): DataTableColumn<PlaygroundRow> {
  return {
    id: "size",
    header,
    width: "sm",
    align: "end",
    sort: { sorted, onSort },
    render: (row) => <SizeCell row={row} />,
  };
}

// 依赖目录只有 node_modules 和 .venv 两种，所以最多两个名字
function dirsText(dirs: readonly string[], t: ReturnType<typeof useT>) {
  const [first = "", second] = dirs;
  return second === undefined ? first : t("library.size.dirs.label", { first, second });
}
