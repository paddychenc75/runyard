import type { Localized } from "@runyard/i18n";
import type { ReactNode } from "react";
import styles from "./SettingsGroup.module.css";

export interface SettingsGroupProps {
  title: Localized;
  /** 组名行右边的按钮（运行环境的“重新检测”） */
  action?: ReactNode;
  children: ReactNode;
  note?: ReactNode;
}

// 设置里的一组（设计稿 Settings）：组名在卡片上方，卡片里是一行行设置，行与行之间一条细线。
export function SettingsGroup({ title, action, children, note }: SettingsGroupProps) {
  return (
    <section className={styles.group}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {action}
      </div>
      <div className={styles.card}>{children}</div>
      {note}
    </section>
  );
}

export interface SettingsRowProps {
  title: Localized;
  /** 名字下面的说明；资源库位置这类显示路径的用等宽字 */
  hint?: ReactNode;
  monoHint?: boolean;
  /** 说明太长时允许换行（默认单行省略） */
  wrapHint?: boolean;
  /** 右边的控件 */
  children?: ReactNode;
}

export function SettingsRow({ title, hint, monoHint, wrapHint, children }: SettingsRowProps) {
  return (
    <div className={styles.row} data-settings-row="">
      <div className={styles.text}>
        <div className={styles.name}>{title}</div>
        {hint === undefined ? null : (
          <div
            className={styles.hint}
            data-mono={monoHint === true ? "" : undefined}
            data-wrap={wrapHint === true ? "" : undefined}
          >
            {hint}
          </div>
        )}
      </div>
      {children === undefined ? null : <div className={styles.control}>{children}</div>}
    </div>
  );
}

/** 一行说明文字，前面带信息图标；没有控件（设计稿“编辑与运行”底部那一行） */
export function SettingsNote({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={styles.note}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
