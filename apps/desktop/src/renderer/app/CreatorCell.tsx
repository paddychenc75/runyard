import { T, useFormat, useT } from "@runyard/i18n/react";
import { Badge, IconButton, Tooltip, UserText } from "@runyard/ui";
import type { PlaygroundRow } from "../../shared/library-state.ts";
import { creatorOf } from "../library-view.ts";
import styles from "./LibraryTable.module.css";

interface CreatorProps {
  row: PlaygroundRow;
}

const commandOf = (row: PlaygroundRow) => {
  const command = row.createdBy.command;
  return command === undefined || command === "" ? null : command;
};

// 创建者列（设计稿 Main、AgentActivity，规格 DESKTOP-LIBRARY-VIEW-53）：我、命令行，或智能体的徽标。
// 智能体的徽标悬停显示创建时间和创建命令；旁边的按钮展开或收起行下面的“由 … 创建”一行。
export function CreatorCell({
  row,
  expanded,
  onToggle,
}: CreatorProps & { expanded: boolean; onToggle: () => void }) {
  const t = useT();
  const format = useFormat();
  const creator = creatorOf(row);
  if (creator.kind === "me")
    return <span className={styles.secondary}>{t("library.creator.me.label")}</span>;
  if (creator.kind === "cli")
    return <span className={styles.secondary}>{t("library.creator.cli.label")}</span>;
  const command = commandOf(row);
  const label = expanded ? t("library.creator.collapse.aria") : t("library.creator.expand.aria");
  return (
    <span className={styles.creator}>
      <Tooltip
        content={t("library.creator.tooltip.label", {
          time: format.dateTime(row.createdAt, "short"),
          hasCommand: command === null ? "no" : "yes",
          command: command ?? "",
        })}
      >
        <Badge variant="violet" icon="spark">
          {creator.name === null ? (
            t("library.creator.agent.label")
          ) : (
            <UserText>{creator.name}</UserText>
          )}
        </Badge>
      </Tooltip>
      <IconButton
        icon="info"
        size="sm"
        label={label}
        aria-expanded={expanded}
        onClick={(event) => {
          // 行的单击和双击是选中与打开，展开按钮不触发它们
          event.stopPropagation();
          onToggle();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    </span>
  );
}

/** 行下面展开的一行：由 <智能体> 创建 · <时间> · 命令：<命令>（规格 DESKTOP-LIBRARY-VIEW“智能体创建的项目”） */
export function CreatorDetails({ row }: CreatorProps) {
  const t = useT();
  const format = useFormat();
  const creator = creatorOf(row);
  const command = commandOf(row);
  const agent =
    creator.kind === "agent" && creator.name !== null
      ? creator.name
      : t("library.creator.agent.label");
  return (
    <p className={styles.details} data-creator-details={row.id}>
      <T
        k="library.creator.details.label"
        values={{
          agent,
          time: format.dateTime(row.createdAt, "short"),
          hasCommand: command === null ? "no" : "yes",
          command: command ?? "",
        }}
        components={{ user: <UserText />, code: <UserText mono /> }}
      />
    </p>
  );
}
