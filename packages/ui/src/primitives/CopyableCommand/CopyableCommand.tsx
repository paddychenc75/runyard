import type { Localized } from "@runyard/i18n";
import type { ComponentProps } from "react";
import { ScrollArea } from "../ScrollArea/index.ts";
import { UserText } from "../UserText/index.ts";
import styles from "./CopyableCommand.module.css";

export interface CopyableCommandProps extends Omit<ComponentProps<"fieldset">, "children"> {
  /** 要显示（也是要被复制）的命令；是数据，不翻译 */
  command: string;
  /** 读屏器读的区域名 */
  label: Localized;
}

// 命令框：一行等宽的命令，点三下或点一下就全选，方便复制。组件只显示，从不执行命令；
// “复制命令”按钮放在旁边，由调用方接剪贴板（设计稿 Missing）。
export function CopyableCommand({ command, label, className, ...rest }: CopyableCommandProps) {
  return (
    <fieldset
      aria-label={label}
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      <ScrollArea orientation="horizontal" className={styles.scroll}>
        <UserText mono className={styles.command}>
          {command}
        </UserText>
      </ScrollArea>
    </fieldset>
  );
}
