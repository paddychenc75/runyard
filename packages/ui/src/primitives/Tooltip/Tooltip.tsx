import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { Localized } from "@runyard/i18n";
import type { ReactElement } from "react";
import { GlassSurface } from "../GlassSurface/index.ts";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** 提示的文字；只补充按钮的名字，不放按钮里没有的信息（键盘用户看不到悬停） */
  content: Localized;
  /** 触发它的元素，必须是单个能接收引用的元素（如 <IconButton>） */
  children: ReactElement;
  side?: "top" | "bottom";
  /** 悬停多久后出现，毫秒；默认 600（Base UI 的默认值），测试里传 0 */
  delay?: number;
  /** 受控和不受控两种用法都支持，名字与 Base UI 一致 */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SIDE_OFFSET = 6;

export function Tooltip({
  content,
  children,
  side = "bottom",
  delay,
  open,
  defaultOpen,
  onOpenChange,
}: TooltipProps) {
  return (
    <BaseTooltip.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <BaseTooltip.Trigger render={children} delay={delay} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={SIDE_OFFSET} className={styles.positioner}>
          <BaseTooltip.Popup render={<GlassSurface material="menu" />} className={styles.popup}>
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
