import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps } from "react";
import styles from "./TextField.module.css";

export interface TextFieldProps extends Omit<ComponentProps<"input">, "type" | "children"> {
  /** 样例里强制显示聚焦的样子 */
  "data-force-state"?: "focus";
}

// 单行输入框（设计稿 CreateDialog）：高 40、圆角 12；聚焦是 1.5 的强调边加 3 的光环。
// 必须放在 Field 里面：名字和说明靠 Field 关联。
export function TextField({ className, ...rest }: TextFieldProps) {
  return (
    <BaseField.Control
      {...rest}
      type="text"
      data-truncate=""
      autoComplete="off"
      spellCheck={false}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    />
  );
}
