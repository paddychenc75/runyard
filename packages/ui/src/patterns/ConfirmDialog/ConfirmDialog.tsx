import type { Localized } from "@runyard/i18n";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { AlertDialog } from "../../primitives/AlertDialog/index.ts";
import { Button } from "../../primitives/Button/index.ts";
import { Checkbox } from "../../primitives/Checkbox/index.ts";
import { Icon } from "../../primitives/Icon/index.ts";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: Localized;
  description: Localized;
  icon: IconName;
  cancelLabel: Localized;
  confirmLabel: Localized;
  /** danger：图标块和确认钮用红色，给“移到废纸篓”这类不可轻易撤销的确认；缺省是强调色 */
  tone?: "default" | "danger";
  /** 勾选项（如“不再提示”）；不传就没有 */
  optOut?: { label: Localized; hint?: Localized };
  /** 点确认；参数是勾选项当时是否勾上（没有勾选项恒为 false） */
  onConfirm: (optedOut: boolean) => void;
  /** 点取消、按 Escape、点遮罩都走这里，勾选项的状态一律丢弃 */
  onCancel: () => void;
  container?: HTMLElement | null;
  /** 描述和勾选项之间的补充内容（如退出时列出还在运行命令的终端）；没有就不画 */
  children?: ReactNode;
}

// 确认弹窗：取消在左、确认在右，打开时焦点在“取消”（确认通常是破坏性的，误按回车不该直接执行）。
// 勾选项只在点确认时交出去；取消不带出勾选状态，每次打开都从未勾选开始。
export function ConfirmDialog({
  open,
  title,
  description,
  icon,
  tone = "default",
  cancelLabel,
  confirmLabel,
  optOut,
  onConfirm,
  onCancel,
  container,
  children,
}: ConfirmDialogProps) {
  const [checked, setChecked] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      description={description}
      leading={<Icon name={icon} size={20} />}
      leadingTone={tone === "danger" ? "danger" : "accent"}
      initialFocus={cancelRef}
      container={container}
      actions={
        <>
          <Button ref={cancelRef} variant="neutral" className={styles.cancel} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "primary"}
            onClick={() => onConfirm(optOut === undefined ? false : checked)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {optOut === undefined ? null : (
        <Checkbox
          label={optOut.label}
          hint={optOut.hint}
          checked={checked}
          onCheckedChange={setChecked}
        />
      )}
    </AlertDialog>
  );
}
