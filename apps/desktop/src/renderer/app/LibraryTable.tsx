import type { Locale } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import {
  Badge,
  DataTable,
  type DataTableColumn,
  MonogramTile,
  StatusMark,
  Tooltip,
  Truncate,
  UserText,
} from "@runyard/ui";
import type { ReactNode } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow } from "../../shared/library-state.ts";
import {
  creatorOf,
  monogramOf,
  pickLocalizedText,
  retentionOf,
  stateLabelKey,
  statusMarkOf,
} from "../library-view.ts";
import styles from "./LibraryTable.module.css";
import { RowActions } from "./RowActions.tsx";

export interface LibraryTableProps {
  bridge: DesktopBridge;
  locale: Locale;
  rows: readonly PlaygroundRow[];
  now: number;
}

// 没有值的格子：端口、从没打开过的“上次打开”。设计稿画的是一条短横线
const NONE = "—";

// 资源库列表（设计稿 Main、MainNarrow；PRD #prd-library-list）：依次是名称与备注、状态、模板、
// 端口、保留、上次打开、创建者、操作。窗口变窄时名称与备注固定在左，圆点补进名称列。
// 操作列是“打开”或“停止运行”加“更多”菜单（RowActions，#171）。
export function LibraryTable({ bridge, locale, rows, now }: LibraryTableProps) {
  const t = useT();
  const format = useFormat();

  const columns: DataTableColumn<PlaygroundRow>[] = [
    {
      id: "name",
      header: t("library.column.name.label"),
      width: "fill",
      pin: "start",
      render: (row) => (
        <div className={styles.nameCell}>
          <StatusMark
            status={statusMarkOf(row.state)}
            markLabel={t(stateLabelKey(row.state))}
            data-when-overflowing=""
          />
          <div className={styles.nameText}>
            <Truncate className={styles.name}>
              <UserText>{row.name}</UserText>
            </Truncate>
            {row.note === "" ? (
              <Truncate className={styles.noteEmpty}>{t("library.note.empty.label")}</Truncate>
            ) : (
              <Truncate className={styles.note}>
                <UserText>{row.note}</UserText>
              </Truncate>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: t("library.column.status.label"),
      width: "xl",
      render: (row) => (
        <StatusMark status={statusMarkOf(row.state)}>{t(stateLabelKey(row.state))}</StatusMark>
      ),
    },
    {
      id: "template",
      header: t("library.column.template.label"),
      width: "flex",
      render: (row) => (
        <span className={styles.template}>
          <MonogramTile letters={monogramOf(row.templateId)} />
          <Truncate>
            <UserText>
              {row.templateName === null
                ? row.templateId
                : pickLocalizedText(row.templateName, locale)}
            </UserText>
          </Truncate>
        </span>
      ),
    },
    {
      id: "port",
      header: t("library.column.port.label"),
      width: "sm",
      render: (row) =>
        row.port === null ? (
          <span className={styles.secondary}>{NONE}</span>
        ) : (
          <UserText mono className={styles.port}>
            {portLabel(row.port)}
          </UserText>
        ),
    },
    {
      id: "retention",
      header: t("library.column.retention.label"),
      width: "md",
      render: (row) => retentionCell(row, now, t),
    },
    {
      id: "lastOpened",
      header: t("library.column.lastOpened.label"),
      width: "lg",
      render: (row) => (
        <span className={styles.secondary}>
          {row.lastOpenedAt === null ? NONE : format.relativeTime(row.lastOpenedAt, now)}
        </span>
      ),
    },
    {
      id: "creator",
      header: t("library.column.creator.label"),
      width: "lg",
      render: (row) => {
        const creator = creatorOf(row);
        if (creator.kind === "me")
          return <span className={styles.secondary}>{t("library.creator.me.label")}</span>;
        if (creator.kind === "cli")
          return <span className={styles.secondary}>{t("library.creator.cli.label")}</span>;
        return (
          <Badge variant="violet" icon="spark">
            {creator.name === null ? (
              t("library.creator.agent.label")
            ) : (
              <UserText>{creator.name}</UserText>
            )}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      hiddenHeader: t("library.column.actions.aria"),
      width: "lg",
      pin: "end",
      render: (row) => <RowActions bridge={bridge} row={row} />,
    },
  ];

  return (
    <DataTable
      label={t("library.table.aria")}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      onRowDoubleClick={(row) => void bridge.call("tab.open", row.id)}
      className={styles.table}
    />
  );
}

const portLabel = (port: number) => `:${port}`;

function retentionCell(row: PlaygroundRow, now: number, t: ReturnType<typeof useT>): ReactNode {
  const retention = retentionOf(row, now);
  if (retention.kind === "kept")
    return <Badge variant="solid">{t("library.retention.kept.label")}</Badge>;
  if (retention.kind === "autoCleanUnknown")
    return <Badge variant="dashed">{t("library.filter.autoClean.label")}</Badge>;
  return (
    <Tooltip content={t("library.retention.autoClean.tooltip", { days: row.autoClean.days ?? 0 })}>
      <Badge variant="dashed">
        {t("library.retention.autoClean.label", { days: retention.daysLeft })}
      </Badge>
    </Tooltip>
  );
}
