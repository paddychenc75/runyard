import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { Localized } from "@runyard/i18n";
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { GlassSurface } from "../GlassSurface/index.ts";
import { ScrollArea } from "../ScrollArea/index.ts";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open: boolean;
  /** Escape 键和点遮罩都会请求关闭（open 变 false） */
  onOpenChange: (open: boolean) => void;
  title: Localized;
  /** 标题下面的一行（如“模板：React 19”） */
  subtitle?: ReactNode;
  /** 标题左边的徽标 */
  leading?: ReactNode;
  /** 标题行右端的动作（如“换一个模板”） */
  headerAction?: ReactNode;
  /** 表单内容 */
  children: ReactNode;
  /** 底部左边的提示（如“按回车直接创建并运行”） */
  hint?: Localized;
  /** 底部按钮，靠右排；主要按钮用 type="submit" */
  actions: ReactNode;
  /** 回车或点提交按钮；输入法组词时的回车不会走到这里 */
  onSubmit: () => void;
  /** 打开时先聚焦谁；缺省聚焦第一个可聚焦的控件 */
  initialFocus?: RefObject<HTMLElement | null>;
  /** 弹窗挂到哪个元素下，缺省是 body；组件样例用它把弹窗限制在舞台里 */
  container?: HTMLElement | null;
}

// 表单弹窗（设计稿 CreateDialog）：玻璃面板，宽 580，垂直居中；整块是一个 form，所以回车即提交。
export function Dialog({
  open,
  onOpenChange,
  title,
  subtitle,
  leading,
  headerAction,
  children,
  hint,
  actions,
  onSubmit,
  initialFocus,
  container,
}: DialogProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  // 输入法正在组词时，回车是确认候选词，不能当提交（规格 DESKTOP-CREATE-FLOW-12）
  function guardComposition(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  }
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal container={container}>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup
          className={styles.popup}
          initialFocus={initialFocus}
          render={<GlassSurface material="dialog" />}
        >
          <ScrollArea className={styles.scroll} viewportClassName={styles.scrollViewport}>
            <form className={styles.form} onSubmit={submit} onKeyDown={guardComposition} noValidate>
              <div className={styles.header}>
                {leading === undefined ? null : <span className={styles.leading}>{leading}</span>}
                <div className={styles.heading}>
                  <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
                  {subtitle === undefined ? null : (
                    <BaseDialog.Description className={styles.subtitle}>
                      {subtitle}
                    </BaseDialog.Description>
                  )}
                </div>
                {headerAction === undefined ? null : (
                  <span className={styles.action}>{headerAction}</span>
                )}
              </div>
              {children}
              <div className={styles.footer}>
                <span className={styles.hint}>{hint}</span>
                {actions}
              </div>
            </form>
          </ScrollArea>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
