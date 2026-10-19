import type { ComponentProps } from "react";
import type { ButtonSize } from "../Button/Button.tsx";
import styles from "./ButtonGroup.module.css";
import { ButtonSizeContext } from "./button-size-context.ts";

export interface ButtonGroupProps extends ComponentProps<"div"> {
  /** 整组按钮的档位；组里 Button 自己的 size 不再起作用 */
  size?: ButtonSize;
  /** 靠哪一头排：start 靠起点，end 靠末端（弹窗底栏），center 居中 */
  align?: "start" | "end" | "center";
  /** row 横排（默认）；column 竖排，用在窄的提示条里 */
  direction?: "row" | "column";
}

// 并排的按钮必须同一档高度，主次只靠颜色分（#419）。把它们放进 ButtonGroup，
// 档位由这里一处定，混用在结构上就做不到；tooling 的 button-groups 检查也要求两个以上相邻按钮用它。
export function ButtonGroup({
  size = "md",
  align = "start",
  direction = "row",
  className,
  children,
  ...rest
}: ButtonGroupProps) {
  return (
    <div
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-align={align}
      data-direction={direction}
      data-size={size}
    >
      <ButtonSizeContext.Provider value={size}>{children}</ButtonSizeContext.Provider>
    </div>
  );
}
