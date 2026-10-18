import { T, useFormat, useT } from "@runyard/i18n/react";
import { Icon, Tooltip, UserText } from "@runyard/ui";
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

// 名称后面的创建徽标（设计稿 Main、AgentActivity，规格 DESKTOP-LIBRARY-VIEW-04、53）：智能体建的挂写智能体名称的徽标，
// 命令行（不是智能体）建的挂“命令行”，在应用里建的不挂。智能体徽标悬停显示创建时间和命令，点它展开或收起行下面的
// “由 … 创建”一行；徽标是按钮，Tab 只在选中的行里才停（表格只占一个 Tab 停点）。
export function CreatorTag({
  row,
  expanded,
  onToggle,
  tabbable,
}: CreatorProps & { expanded: boolean; onToggle: () => void; tabbable: boolean }) {
  const t = useT();
  const format = useFormat();
  const creator = creatorOf(row);
  if (creator.kind === "me") return null;
  if (creator.kind === "cli")
    return (
      <span className={styles.tag} data-kind="cli">
        {t("library.creator.cli.label")}
      </span>
    );
  const command = commandOf(row);
  return (
    <Tooltip
      content={t("library.creator.tooltip.label", {
        time: format.dateTime(row.createdAt, "short"),
        hasCommand: command === null ? "no" : "yes",
        command: command ?? "",
      })}
    >
      <button
        type="button"
        className={styles.tag}
        data-kind="agent"
        aria-expanded={expanded}
        tabIndex={tabbable ? 0 : -1}
        onClick={(event) => {
          // 行的单击和双击是选中与打开，展开徽标不触发它们
          event.stopPropagation();
          onToggle();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Icon name="spark" size={10} />
        <span className={styles.tagText} data-truncate="">
          {creator.name === null ? (
            t("library.creator.agent.label")
          ) : (
            <UserText>{creator.name}</UserText>
          )}
        </span>
      </button>
    </Tooltip>
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
