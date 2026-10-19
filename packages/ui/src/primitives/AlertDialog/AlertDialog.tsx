import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import type { Localized } from "@runyard/i18n";
import type { ReactNode, RefObject } from "react";
import { ButtonGroup } from "../ButtonGroup/index.ts";
import { GlassSurface } from "../GlassSurface/index.ts";
import styles from "./AlertDialog.module.css";

export interface AlertDialogProps {
  open: boolean;
  /** Escape 键和点遮罩都会请求关闭（open 变 false）；不会因此执行“确认”类动作 */
  onOpenChange: (open: boolean) => void;
  title: Localized;
  /** 标题下面的说明，读屏器作为描述朗读 */
  description: Localized;
  /** 标题左边的图标块 */
  leading?: ReactNode;
  /** 图标块的色调：danger 是红色（移到废纸篓这类不可轻易撤销的确认），缺省是强调色 */
  leadingTone?: "accent" | "danger";
  /** 说明和按钮之间的内容（如勾选项） */
  children?: ReactNode;
  /** 底部按钮，靠右排 */
  actions: ReactNode;
  /** 打开时先聚焦谁；破坏性的确认框应当聚焦“取消” */
  initialFocus?: RefObject<HTMLElement | null>;
  /** 弹窗挂到哪个元素下，缺省是 body；组件样例用它把弹窗限制在舞台里 */
  container?: HTMLElement | null;
}

// 居中偏上的玻璃弹窗（设计稿 CloseConfirm）：宽度、圆角、材质来自设计变量，遮罩盖住整个窗口。
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  leading,
  leadingTone = "accent",
  children,
  actions,
  initialFocus,
  container,
}: AlertDialogProps) {
  return (
    <BaseAlertDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseAlertDialog.Portal container={container}>
        <BaseAlertDialog.Backdrop className={styles.backdrop} />
        <BaseAlertDialog.Popup
          className={styles.popup}
          initialFocus={initialFocus}
          render={<GlassSurface material="dialog" />}
        >
          <div className={styles.header}>
            {leading === undefined ? null : (
              <span className={styles.leading} data-tone={leadingTone}>
                {leading}
              </span>
            )}
            <div className={styles.heading}>
              <BaseAlertDialog.Title className={styles.title}>{title}</BaseAlertDialog.Title>
              <BaseAlertDialog.Description className={styles.description}>
                {description}
              </BaseAlertDialog.Description>
            </div>
          </div>
          {children}
          <ButtonGroup size="lg" align="end">
            {actions}
          </ButtonGroup>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
