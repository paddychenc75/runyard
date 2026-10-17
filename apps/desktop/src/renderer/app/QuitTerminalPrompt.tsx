import { useT } from "@runyard/i18n/react";
import { ConfirmDialog, UserText } from "@runyard/ui";
import type { TerminalBusy } from "../../shared/terminal.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./QuitTerminalPrompt.module.css";

export interface QuitTerminalPromptProps {
  /** 要问的终端；不用问是 null */
  busy: readonly TerminalBusy[] | null;
  /** 项目 id 到显示名（标签页上的名字） */
  nameOf: (project: string) => string;
  onAnswer: (quit: boolean) => void;
}

// ⌘Q 时有终端里的命令在运行（规格 DESKTOP-TERMINAL-30）：问一次，列出这些项目和命令，
// 按钮“取消”和“退出”；空闲的终端不列。在编辑器的“保存／不保存／取消”之后出现。
export function QuitTerminalPrompt({ busy, nameOf, onAnswer }: QuitTerminalPromptProps) {
  const t = useT();
  useOverlay(busy !== null);
  return (
    <ConfirmDialog
      open={busy !== null}
      icon="stop"
      title={t("desktop.quitConfirm.title")}
      description={t("desktop.quitConfirm.body")}
      cancelLabel={t("desktop.quitConfirm.cancel.action")}
      confirmLabel={t("desktop.quitConfirm.confirm.action")}
      onConfirm={() => onAnswer(true)}
      onCancel={() => onAnswer(false)}
    >
      <ul className={styles.list}>
        {(busy ?? []).map((entry) => (
          <li key={entry.project} className={styles.item}>
            <UserText mono>
              {t("desktop.quitConfirm.item.label", {
                project: nameOf(entry.project),
                command: entry.command,
              })}
            </UserText>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
