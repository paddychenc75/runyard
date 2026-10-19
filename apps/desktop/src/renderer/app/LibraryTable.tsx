import type { Locale, Localized } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import {
  DataTable,
  type DataTableColumn,
  type DataTableDetail,
  Icon,
  MonogramTile,
  StatusMark,
  Tooltip,
  Truncate,
  UserText,
} from "@runyard/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { isDueTomorrow } from "../../shared/clean-due.ts";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { lastUsedAt } from "../../shared/last-used.ts";
import type { PlaygroundRow } from "../../shared/library-state.ts";
import type { SortKey } from "../library-query.ts";
import {
  brandOf,
  logoOf,
  monogramOf,
  pickLocalizedText,
  retentionOf,
  stateLabelKey,
  statusMarkOf,
} from "../library-view.ts";
import { useContentVisible } from "../shared/content-visibility.ts";
import { ActionFailedDialog } from "./ActionFailedDialog.tsx";
import { CreatorDetails, CreatorTag } from "./CreatorCell.tsx";
import { sizeColumn } from "./LibrarySizeColumn.tsx";
import styles from "./LibraryTable.module.css";
import { MissingNote } from "./MissingNote.tsx";
import { RenameInlineActions, RenameInlineFields } from "./RenameInline.tsx";
import { RowActions } from "./RowActions.tsx";
import { useLibraryReveal } from "./use-library-reveal.ts";
import { useRelocate } from "./use-relocate.ts";
import { useRenameDraft } from "./use-rename-draft.ts";

export interface LibraryTableProps {
  bridge: DesktopBridge;
  locale: Locale;
  rows: readonly PlaygroundRow[];
  now: number;
  /** 当前排序，和“排序”下拉是同一个值；点“大小”表头等于选“大小” */
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  reveal?: { id: string; sequence: number };
}

// 没有值的格子用短横线。
const NONE = "—";

// 资源库方案 A：列宽取设计稿组合已有变量；窄窗口先收最近使用、端口，再把模板收为徽标。
export function LibraryTable({
  bridge,
  locale,
  rows,
  now,
  sort,
  onSortChange,
  reveal,
}: LibraryTableProps) {
  const t = useT();
  const format = useFormat();
  // 创建副本后选中它（规格 DESKTOP-LIBRARY-VIEW-42）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useLibraryReveal(reveal, rows, setSelectedId);
  const taken = useMemo(() => rows.map((row) => row.name), [rows]);
  const draft = useRenameDraft(bridge, taken);
  const editingId = draft.session?.target.id ?? null;
  const relocating = useRelocate(bridge);
  useRowKeyboard(
    rows,
    selectedId,
    setSelectedId,
    editingId,
    (id) => void bridge.call("tab.open", id),
  );
  // 展开了创建信息的智能体项目（规格 DESKTOP-LIBRARY-VIEW“智能体创建的项目”）
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // 找不到文件夹的行其余列变淡（设计稿 FolderMissing）
  const dim = (row: PlaygroundRow, node: ReactNode): ReactNode =>
    row.missing ? <span className={styles.dim}>{node}</span> : node;

  const columns: DataTableColumn<PlaygroundRow>[] = [
    {
      id: "name",
      header: t("library.column.name.label"),
      width: "fill",
      render: (row) =>
        row.id === editingId ? (
          <RenameInlineFields draft={draft} />
        ) : (
          <div className={styles.nameText}>
            <div className={styles.nameLine}>
              <Truncate className={styles.name}>
                <UserText>{row.name}</UserText>
              </Truncate>
              <CreatorTag
                row={row}
                expanded={expanded.has(row.id)}
                onToggle={() => toggleExpanded(row.id)}
              />
            </div>
            {row.note === "" ? (
              <Truncate className={styles.noteEmpty}>{t("library.note.empty.label")}</Truncate>
            ) : (
              <Truncate className={styles.note}>
                <UserText>{row.note}</UserText>
              </Truncate>
            )}
          </div>
        ),
    },
    {
      id: "status",
      header: t("library.column.status.label"),
      width: {
        size: "calc(var(--size-column-xl) - var(--space-4))",
        compact: { whenCollapsed: "port", size: "var(--size-column-flex-min)" },
      },
      render: (row) =>
        row.missing ? (
          <span className={styles.missingStatus} data-missing-status="">
            <Icon name="warning" size={12} />
            <Truncate>{t("library.missing.status.label")}</Truncate>
          </span>
        ) : (
          <span className={styles.statusCell}>
            <StatusMark status={statusMarkOf(row.state)}>{t(stateLabelKey(row.state))}</StatusMark>
            {/* 端口列收起后，运行中的行把端口写在状态后面（规格 DESKTOP-LIBRARY-VIEW-29） */}
            {row.active && row.port !== null ? (
              <UserText mono className={styles.statusPort} data-when-collapsed="port">
                {portLabel(row.port)}
              </UserText>
            ) : null}
          </span>
        ),
    },
    {
      id: "template",
      header: t("library.column.template.label"),
      width: { size: "calc(var(--size-column-flex-min) + var(--space-5))" },
      collapse: { order: 3, mode: "narrow", narrowWidth: { size: "var(--size-tile)" } },
      render: (row, { collapsed }) => {
        const name =
          row.templateName === null ? row.templateId : pickLocalizedText(row.templateName, locale);
        const tile = (
          <MonogramTile
            letters={monogramOf(row.templateId)}
            logo={logoOf(row.templateId)}
            brand={brandOf(row.templateId)}
          />
        );
        return dim(
          row,
          <span className={styles.template}>
            {/* 收成只有徽标时，悬停显示模板名（规格 DESKTOP-LIBRARY-VIEW-28） */}
            {collapsed ? <Tooltip content={name as Localized}>{tile}</Tooltip> : tile}
            <Truncate data-collapse-hide="">
              <UserText>{name}</UserText>
            </Truncate>
          </span>,
        );
      },
    },
    {
      id: "port",
      header: t("library.column.port.label"),
      width: { size: "calc(var(--size-column-sm) - var(--space-9))" },
      collapse: { order: 2, mode: "hide" },
      render: (row) =>
        dim(
          row,
          row.port === null ? (
            <span className={styles.secondary}>{NONE}</span>
          ) : (
            <UserText mono className={styles.port}>
              {portLabel(row.port)}
            </UserText>
          ),
        ),
    },
    sizeColumn(t("library.column.size.label"), sort === "size", () => onSortChange("size")),
    {
      id: "lastUsed",
      header: t("library.column.lastUsed.label"),
      width: "md",
      collapse: { order: 1, mode: "hide" },
      render: (row) =>
        dim(
          row,
          <span className={styles.secondary}>{format.relativeTime(lastUsedAt(row), now)}</span>,
        ),
    },
    {
      id: "retention",
      header: t("library.column.retention.label"),
      width: {
        size: "calc(var(--size-column-lg) - var(--space-3))",
        compact: {
          whenCollapsed: "template",
          size: "calc(var(--size-column-md) - var(--space-2))",
        },
      },
      render: (row) =>
        row.id === editingId ? (
          <RenameInlineActions draft={draft} />
        ) : (
          dim(row, retentionCell(row, now, t))
        ),
    },
    {
      id: "actions",
      hiddenHeader: t("library.column.actions.aria"),
      width: { size: "calc(var(--size-column-lg) - var(--space-3))" },
      reveal: true,
      render: (row, { selected }) => (
        <RowActions
          bridge={bridge}
          row={row}
          taken={taken}
          now={now}
          tabbable={selected}
          onInlineRename={(target, focus) =>
            draft.begin(
              { id: target.id, name: target.name, note: target.note, running: target.active },
              focus,
            )
          }
          onDuplicated={setSelectedId}
          onRelocate={() => void relocating.relocate(row.id)}
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        label={t("library.table.aria")}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        selectedId={selectedId}
        editingId={editingId}
        // 编辑中的行：名称框占名称到模板三列，取消和保存占自动清理和操作两列（设计稿 RenameInline）
        cellSpan={(row, columnId) =>
          row.id !== editingId ? 1 : columnId === "name" ? 3 : columnId === "retention" ? 2 : 1
        }
        renderDetail={(row): DataTableDetail | null => {
          if (row.missing) {
            return {
              tone: "warning",
              content: (
                <MissingNote
                  bridge={bridge}
                  id={row.id}
                  name={row.name}
                  folder={row.folder ?? row.path}
                  mismatch={relocating.mismatchId === row.id}
                  onRelocate={() => void relocating.relocate(row.id)}
                  onForget={() => void relocating.forget(row.id)}
                />
              ),
            };
          }
          if (!expanded.has(row.id)) return null;
          return { tone: "neutral", content: <CreatorDetails row={row} /> };
        }}
        onRowClick={(row) => setSelectedId(row.id)}
        // 弹窗经 React 事件冒泡到行上：只有双击发生在这一行自己里面才打开
        onRowDoubleClick={(row, event) => {
          if (event.currentTarget.contains(event.target as Node) && row.id !== editingId) {
            void bridge.call("tab.open", row.id);
          }
        }}
        className={styles.table}
      />
      {relocating.failed === null ? null : (
        <ActionFailedDialog error={relocating.failed} onClose={relocating.clearFailed} />
      )}
    </>
  );
}

const portLabel = (port: number) => `:${port}`;

// 自动清理列（规格 DESKTOP-LIBRARY-VIEW-03）：没开写淡灰的“—”，开了写时钟图标加“剩 N 天”，
// 到期前一天图标和文字都用警示色写“明天清理”；不用胶囊
function retentionCell(row: PlaygroundRow, now: number, t: ReturnType<typeof useT>): ReactNode {
  if (isDueTomorrow(row, now))
    return (
      <span className={styles.cleanSoon} data-clean-tomorrow="">
        <Icon name="clock" size={12} />
        {t("library.retention.tomorrow.label")}
      </span>
    );
  const retention = retentionOf(row, now);
  if (retention.kind === "kept")
    return <span className={styles.tertiary}>{t("library.retention.off.label")}</span>;
  if (retention.kind === "autoCleanUnknown")
    return (
      <span className={styles.clean}>
        <Icon name="clock" size={12} className={styles.tertiary} />
        {t("library.filter.autoClean.label")}
      </span>
    );
  return (
    <Tooltip content={t("library.retention.autoClean.tooltip", { days: retention.daysLeft })}>
      <span className={styles.clean}>
        <Icon name="clock" size={12} className={styles.tertiary} />
        {t("library.retention.autoClean.label", { days: retention.daysLeft })}
      </span>
    </Tooltip>
  );
}

// 选中行的键盘（规格 DESKTOP-LIBRARY-VIEW-30）：上下方向键移动选中行，回车等同“打开”。
// 行本身不是控件，所以挂在文档上；焦点在输入框、按钮、菜单或弹窗里时让给它们。
function useRowKeyboard(
  rows: readonly PlaygroundRow[],
  selectedId: string | null,
  select: (id: string) => void,
  editingId: string | null,
  open: (id: string) => void,
) {
  const visible = useContentVisible();
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (editingId !== null || rows.length === 0) return;
      const target = event.target as Element | null;
      if (
        target !== null &&
        target.closest(
          "input, textarea, select, button, a, [role='menu'], [role='dialog'], [role='alertdialog'], [contenteditable]",
        ) !== null
      )
        return;
      if (document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']") !== null)
        return;
      const index = rows.findIndex((row) => row.id === selectedId);
      if (event.key === "Enter") {
        if (index < 0) return;
        event.preventDefault();
        open(rows[index]?.id ?? "");
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const next = event.key === "ArrowDown" ? index + 1 : index < 0 ? 0 : index - 1;
        const row = rows[Math.min(Math.max(next, 0), rows.length - 1)];
        if (row === undefined) return;
        event.preventDefault();
        select(row.id);
        // 行 id 是用户起的名字，不拼进选择器
        for (const line of document.querySelectorAll("tr[data-row-id]"))
          if (line.getAttribute("data-row-id") === row.id)
            line.scrollIntoView?.({ block: "nearest" });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [rows, selectedId, select, editingId, open, visible]);
}
