import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { Localized } from "@runyard/i18n";
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { ButtonGroup } from "../ButtonGroup/index.ts";
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
  /** 宽版（720）：内容是带树或表的表单时用（另存为模板，设计稿 SaveTemplate） */
  wide?: boolean;
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
  wide = false,
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
  const header = (
    <div className={styles.header}>
      {leading === undefined ? null : <span className={styles.leading}>{leading}</span>}
      <div className={styles.heading}>
        <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
        {subtitle === undefined ? null : (
          <BaseDialog.Description className={styles.subtitle}>{subtitle}</BaseDialog.Description>
        )}
      </div>
      {headerAction === undefined ? null : <span className={styles.action}>{headerAction}</span>}
    </div>
  );
  const footer = (
    <>
      <span className={styles.hint}>{hint}</span>
      <ButtonGroup size="lg" align="end">
        {actions}
      </ButtonGroup>
    </>
  );
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal container={container}>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup
          className={wide ? `${styles.popup} ${styles.wide}` : styles.popup}
          initialFocus={initialFocus}
          render={<GlassSurface material="dialog" />}
        >
          {wide ? (
            // 宽版：底栏钉在弹窗底部，只有上面的表单区滚动（设计稿 SaveTemplate 的底栏有分隔线）
            <form
              className={styles.pinned}
              onSubmit={submit}
              onKeyDown={guardComposition}
              noValidate
            >
              <ScrollArea className={styles.scroll} viewportClassName={styles.scrollViewport}>
                <div className={styles.form}>
                  {header}
                  {children}
                </div>
              </ScrollArea>
              <div className={`${styles.footer} ${styles.pinnedFooter}`}>{footer}</div>
            </form>
          ) : (
            <ScrollArea className={styles.scroll} viewportClassName={styles.scrollViewport}>
              <form
                className={styles.form}
                onSubmit={submit}
                onKeyDown={guardComposition}
                noValidate
              >
                {header}
                {children}
                <div className={styles.footer}>{footer}</div>
              </form>
            </ScrollArea>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
